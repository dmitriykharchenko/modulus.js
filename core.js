//core
var modulus = (function(_, window, undefined){
  var is_test_mode = true || window.TESTMODE || /_testmode_/g.test(location.search) || false;
  var reserved_names = [];

  var debug = !is_test_mode ? function(){} : (function(){
    var state = {
      logs: {},
      modules: {
        ready: {},
        pending: {}
      }
    };

    var loggers = {
      log: function(log_type){
        var data = _.rest(arguments);
        if(!state.logs[log_type]){
          state.logs[log_type] = [];
        }
        state.logs[log_type].push({
          name: log_type,
          time: +new Date(),
          ready_time: null,
          data: data
        });
      },
      pending_module: function(description){
        var data = _.clone(description);
        data.pending_time = +new Date();
        state.modules.pending[data.path] = data;
      },
      ready_module: function(name){
        var pending_data = state.modules.pending[name] || {};
        pending_data.ready_time = +new Date();
        state.modules.ready[name] = pending_data;
        delete state.modules.pending[name];
      }
    };

    var debug_interface = function(type){
      var logger = loggers[type] || loggers.log;
      logger.apply(loggers, _.rest(arguments));
    };

    debug_interface.state = state;
    return debug_interface;
  }());

  var sandboxes = (function(){
    var trailers = [];

    trailers.push(function(sandbox, description){
      _.extend(sandbox, {
        module_name: description.name,
        path: description.path,
        sandbox_description: description
      });
    });

    var create_sandbox = function(description){
      var actions = [];
      var sandbox = function(){
        var sandbox_arguments = arguments;
        _.each(actions, function(action){
          action.apply(sandbox, sandbox_arguments);
        });
      };
      sandbox.debug = debug;
      _.each(trailers, function(trailer){
        sandbox = trailer(sandbox, description, actions) || sandbox;
      });
      return sandbox;
    };
    return {
      create: create_sandbox,
      trail: function(trailer){
        trailers.push(trailer);
      }
    };
  }());

  var set_zero_timeout = (function(sandbox){
    var timeouts = [];
    var messageName = "zero-timeout-message-" + new Date().getTime();

    var zero_timeouts_count = 1000;
    var counter = 0;
    var set_zero_timeout = function(fn) {
      counter--;
      if(counter < 0){
        counter = zero_timeouts_count;
        return setTimeout(fn, 10);
      } else {
        timeouts.push(fn);
        return window.postMessage(messageName, "*");
      }
    };
   
    var handle_message = function(event) {
      if (event.data === messageName) {
        event.cancelBubble = true;
        event.returnValue = false;
        if(event.stopPropagation){
          event.stopPropagation();
        }
        if(event.preventDefault){
          event.preventDefault();
        }
        if(0 < timeouts.length){
          var fn = timeouts.shift();
          fn();
        }
      }
    };
   
    if(window.addEventListener){
      window.addEventListener("message", handle_message, true);
    }else if (window.attachEvent) {   // IE before version 9
      zero_timeouts_count = 10;
      window.attachEvent("onmessage", handle_message);
    }

    reserved_names.push("set_zero_timeout");
    sandboxes.trail(function(sandbox){
      sandbox.set_zero_timeout = set_zero_timeout;
    });
   
    return set_zero_timeout;
  }());
  
  var helpers = {
    module_ready_event_name: function(path){
      return ["module", path || "core", "ready"].join(":");
    }
  };

  var events = (function(){
    reserved_names = reserved_names.concat(["unbind", "bind", "trigger", "pub", "sub", "unsub", "wait"]);
    var events_hash = {
      handlers: {},
      states: {}
    };
    var prepare_bind_params = function(events, handler, params){
      if(!_.isString(events)){
        return events;
      }
      params = params || {is_wait: false};
      params.is_wait = params.is_wait && _.isFunction(handler);
      var all_events = _.compact(events.split(/\s+/));
      if(params.is_wait){
        var waiter = handler;
        var event_data = {};
        handler = function(data){
          var event = _.last(arguments);
          all_events = _.without(all_events, event.name);
          event_data[event.name] = data;
          if(all_events.length === 0){
            waiter(event_data, {
              name: events
            });
          }
        };
      } 
      var bind_hash = {};
      _.each(all_events, function(name){
        bind_hash[name] = handler;
      });
      return bind_hash;
    };

    var handler_call = function(handler, name, data){
      var start = +new Date();
      var event_data = {name: name};
      var handler_params = [];
      if(_.isArray(data)){
        handler_params = data;
      } else {
        handler_params.push(data);
      }
      handler_params.push(event_data);
      handler.apply(event_data, handler_params);
      debug("logs", "execution time", +new Date() - start, name, handler);
    };

    var events = {
      bind: function(events, handler, params){
        debug("logs", "bind", arguments, this.name);
        var bind_hash = prepare_bind_params(events, handler, params);
        _.each(bind_hash, function(handler, name){
          if(events_hash.states[name]){
            handler_call(handler, name, events_hash.states[name]);
          }
          handler.id = handler.id || _.uniqueId(name + "_handler_");
          events_hash.handlers[name] = events_hash.handlers[name] || {};
          events_hash.handlers[name][handler.id] = handler;
        });
      },
      unbind: function(event_name, handler){
        var id = handler.id;
        if(!id || !events_hash.handlers[event_name]){
          return;
        }
        delete events_hash.handlers[event_name][id];
      },
      trigger: function(event_name, data, params){
        debug("logs","trigger", arguments, this.name);
        params = params || {};
        data = data || {};
        if(!!params.is_state){
          events_hash.states[event_name] = data;
        }
        var handlers_list = events_hash.handlers[event_name] || {};
        var caller = function(handler){
          handler_call(handler, event_name, data);
        };
        _.each(handlers_list, params.is_sync ? caller : function(handler){
          set_zero_timeout(function(){
            caller(handler);
          });
        });
      },
      wait: function(events_list, handler, options){
        return !!events_list ? events.bind(events_list, handler, _.extend(options || {}, {is_wait: true})) : handler({});
      }
    };

    sandboxes.trail(function(sandbox){
      sandbox.unsub = sandbox.unbind = events.unbind;
      sandbox.sub = sandbox.bind = events.bind;
      sandbox.pub = sandbox.trigger = events.trigger;
      sandbox.wait = events.wait;
    });
    return events;
  }());

   var modules = (function(){
    var alliaces = {};
    var _helpers = {
      is_valid_name: function(name){
        return _.indexOf(reserved_names, name) < 0;
      },
      cast_require: function(description){
        description.require = description.require || [];
        description.alliaces = {};
        var require_extention = [];
        var self = this;
        if(description.config){
          alliaces[description.config] = "config";
          description.require.push(description.config);
        }
        _.each(description.require, function(module_name){
          if(!_.isString(module_name)){
            _.extend(description.alliaces, module_name);
          }
        });
        description.require = description.require.concat(require_extention);
        if(description.parent){
          description.require.push(description.parent);
        }
      },
      cast_description: function(path, description){
        if(description === undefined){
          description = {};
        }

        var sandbox_path = path.split(".");
        var name = sandbox_path.pop();
        if(!this.is_valid_name(name)){
          return false;
        }
        
        description.name = name;
        description.path = path;
        description.parent = sandbox_path.join(".");
        this.cast_require(description);
        return description;
      }
    };

    var modules_ready_events = function(modules_list){
      return _.map(modules_list, function(module_name){
        return helpers.module_ready_event_name(module_name);
      }).join(" ");
    };

    var all_sandboxes = {
      root: null,
      list: {},
      get: function(module_path){
        if(!module_path){
          return this.root;
        }
        return this.list[module_path] || null;
      },
      add: function(description, sandbox){
        if(this.root === null){
          this.root = sandbox;
          return true;
        } else if(!this.list[description.path]){
          this.list[description.path] = sandbox;
          return true;
        }
        return false;
      }
    };


    sandboxes.trail(function(sandbox, description, actions){
      if(!all_sandboxes.add(description, sandbox)){
        return;
      }
      
      sandbox.create_aliace = function(aliace){
        alliaces[this.path] = aliace;
      };

      actions.push(function(module_path, module, new_description){
        if(!_.isString(module_path) || !_.isFunction(module) || all_sandboxes.list[module_path]){
          return;
        }
        var description = _helpers.cast_description(module_path, new_description);
        var self = this;
        debug("pending_module", description);
        var events = modules_ready_events(description.require) || "";
        events = description.init_event ? events + " " + description.init_event : events;
        this.wait(events, function(modules){
          var parent = all_sandboxes.get(description.parent);
          var module_sandbox = sandboxes.create(description);

          module_sandbox[description.parent] = parent.module;
          module_sandbox.parent = parent;
          _.each(modules, function(info){
            if(info.path){
              var root_name = info.path.split(".")[0];
              module_sandbox[root_name] = all_sandboxes.get(root_name).module;
              var alliace = description.alliaces[info.path] || alliaces[info.path];
              if(alliace){
                module_sandbox[alliace] = info.module;
              };
            }
          });

          var init_data = {};

          if(description.init_event){
            init_data = modules[description.init_event];
          }

          module_sandbox.module = module.call(module_sandbox, module_sandbox, init_data);
          module_sandbox[module_sandbox.module_name] = module_sandbox.module;

          if(parent.module){
            parent.module[module_sandbox.module_name] = module_sandbox.module;
          } else {
            parent[module_sandbox.module_name] = module_sandbox.module;
          }
          var module_ready_event_data = {
            path: module_sandbox.path,
            name: module_sandbox.module_name,
            module: module_sandbox.module
          };
          module_sandbox.pub(
            helpers.module_ready_event_name(module_sandbox.path), 
            module_ready_event_data, 
            {is_state: true}
          );
          parent.pub(parent.path + ":child:ready", module_ready_event_data);
          debug("ready_module", description.path);
        });
      });
    });
    return function(module_path){
      return all_sandboxes.get(module_path);
    };
  }());

  var sandbox_extentions = (function(){
    var extentions = {
      _root: {
        extention: {}
      },
      add: function(path, extention){
        if(path === ""){
          _.extend(this.root.extention, extention);
        }
        var ext_root = this._root;
        _.each(path.split("."), function(name){
          if(!ext_root[name]){
            ext_root[name] = {
              extention: {}
            };
          }
          ext_root = ext_root[name];
        });
        _.extend(ext_root.extention, extention);
      },
      get: function(path){
        var extentions = [{}];
        var ext_root = this._root;
        _.find(path.split("."), function(name){
          if(ext_root){
            extentions.push(ext_root.extention);
            ext_root = ext_root[name];
          } else {
            return true;
          }
        });
        if(extentions.length !== 0){
          return _.extend.apply(_, [{}].concat(extentions));
        }
        return null;
      }
    };
    var add_extention = function(extention){
      extentions.add(this.path || "", extention || {});
    };
    sandboxes.trail(function(sandbox, description, actions){
      if(description.path){
        var sandbox_extention = extentions.get(description.path);
        if(sandbox_extention){
          _.extend(sandbox, sandbox_extention);
        }
        sandbox.extention = add_extention;
      }
    });
    return extentions;
  }());

  var module_dom_selectors = (function(){
    sandboxes.trail(function(sandbox){
      sandbox.self_markup_dom_selector = function(){
        return this.path.replace(/\:/g, "\\:");
      };
      sandbox.self_data_attr_name = function(){
        return this.path.replace(/\./g, '-');
      };
      sandbox.self_attr_dom_selector = function(){
        return "[data-" + this.self_data_attr_name() + "]";
      };
    });
  }());
  
  var tests = (function(){
    var tests_data = {};
    reserved_names.push("test");
    var test = function(test_obj){
      test_obj.sandbox = this;
      tests_data[this.path] = test_obj;
    };
    test.get = function(path){
      return tests_data[path] || {
        sandbox: modules.get(path)
      };
    };
    test.core_inner = {
      sandboxes: sandboxes,
      events: events,
      modules: modules,
      module_dom_selectors: module_dom_selectors,
      sandbox_extentions: sandbox_extentions,
      debug: debug
    };
    sandboxes.trail(function(sandbox){
      sandbox.test = is_test_mode ? test : function(){};
    });
  }());

  _.templateSettings = {
    interpolate : /\{\{(.+?)\}\}/g
  };

  return sandboxes.create({
    name: "core"
  });
}(_, window));

window.M = modulus;