//core
var modulus = (function(_, window, undefined){
  var is_test_mode = window.TESTMODE || /_testmode_/g.test(location.search) || false;
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
      if(is_test_mode){
        sandbox.debug = debug;
      }
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
      var all_events = events.split(" ");
      if(params.is_wait){
        var waiter = handler;
        var event_data = {};
        handler = function(data, event){
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
      handler(data, {name: name});
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
      wait: function(events_list, handler){
        return !!events_list ? events.bind(events_list, handler, {is_wait: true}) : handler({});
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
    var relates = {};
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
          var config = {};
          config[description.config] = "config";
          description.require.push(config);
        }
        _.each(description.require, function(module_name){
          if(!_.isString(module_name)){
            _.extend(description.alliaces, module_name);
          }
          if(relates[module_name]){
            require_extention = require_extention.concat(relates[module_name]);
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
        if(description.relate){
          relates[description.path] = description.relate;
        }
        return description;
      }
    };

    var modules_ready_events = function(modules_list){
      return _.map(modules_list, function(module_name){
        return helpers.module_ready_event_name(module_name);
      }).join(" ");
    };

    var create = function(sandbox, module, data){
      var module_interface = module.call(sandbox, sandbox, data);
      var module_event_data = {
        path: sandbox.path,
        name: sandbox.module_name,
        module: module_interface
      };
      sandbox.pub(helpers.module_ready_event_name(sandbox.path), module_event_data, {is_state: true});
      debug("ready_module", sandbox.path);
      return module_interface;
    };

    var sandboxes_tree = {
      root: null,
      get: function(module_path){
        if(!module_path){
          return this.root;
        }
        var root = this.root;
        _.find(module_path.split("."), function(name){
          if(root[name]){
            root = root[name];
          } else {
            root = null;
            return true;
          }
        });
        return root;
      },
      add: function(description, sandbox){
        if(this.root === null){
          this.root = {
            sandbox: sandbox
          };
          sandbox.root = true;
          return;
        }
        var root = this.root;
        _.each(description.path.split("."), function(name){
          if(!root[name]){
            root[name] = {
              sandbox: null
            };
          }
          root = root[name];
        });
        root.sandbox = sandbox;
      }
    };

    sandboxes.trail(function(sandbox, description, actions){
      sandboxes_tree.add(description, sandbox);
      if(sandbox.name !== ""){
        return;
      }

      sandbox.create_aliace = function(aliace){
        alliaces[this.path] = aliace;
      };

      actions.push(function(module_path, module, new_description){
        if(!_.isString(module_path) || !_.isFunction(module)){
          return;
        }
        var description = _helpers.cast_description(module_path, new_description);
        var self = this;
        debug("pending_module", description);
        this.wait(modules_ready_events(description.require), function(modules){
          var parent = sandboxes_tree.get(description.parent);
          var module_sandbox = sandboxes.create(description);

          module_sandbox[description.parent] = parent.sandbox.module;
          module_sandbox.parent = parent;

          _.each(modules, function(info){
            var root_name = info.path.split(".")[0];
            module_sandbox[root_name] = sandboxes_tree.get(root_name).module;
            var alliace = description.alliaces[info.path] || alliaces[info.path];
            if(alliace){
              module_sandbox[alliace] = info.module;
            }
          });
          module_sandbox.module = create(module_sandbox, module);
          if(parent.sandbox.module){
            parent.sandbox.module[module_sandbox.module_name] = module_sandbox.module;
          }
          debug("ready_module", description.path);
        });
      });
    });
    return function(module_path){
      return sandboxes_tree.get(module_path);
    };
  }());

  var module_dom_element_selector = (function(){
    sandboxes.trail(function(sandbox){
      sandbox.module_dom_element_selector = function(){
        return this.path.replace(/\:/g, "\\:");
      }
    });
  }());

  
  var tests = (function(){
    var tests_data = {};
    reserved_names.push("test");
    var test = function(test_obj){
      tests_data[this.path] = {
        test_data: test_obj,
        sandbox: this
      };
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