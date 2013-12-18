(function() {
  new (function() {
    var all_sandboxes, alliaces, modules_ready_events, _helpers;
    alliaces = {};
    scope.add_logger("pending_module", function(description) {
      var data;
      data = _.clone(description);
      data.pending_time = +new Date();
      return state.modules.pending[data.path] = data;
    });
    scope.add_logger("ready_module", function(name) {
      var pending_data;
      pending_data = state.modules.pending[name] || {};
      pending_data.ready_time = +new Date();
      state.modules.ready[name] = pending_data;
      return delete state.modules.pending[name];
    });
    _helpers = {
      is_valid_name: function(name) {
        return _.indexOf(reserved_names, name) < 0;
      },
      cast_require: function(description) {
        var require_extention, self;
        description.require = description.require || [];
        description.alliaces = {};
        require_extention = [];
        self = this;
        if (description.config) {
          alliaces[description.config] = "config";
          description.require.push(description.config);
        }
        _.each(description.require, function(module_name) {
          if (!_.isString(module_name)) {
            return _.extend(description.alliaces, module_name);
          }
        });
        description.require = description.require.concat(require_extention);
        if (description.parent) {
          return description.require.push(description.parent);
        }
      },
      cast_description: function(path, description) {
        var name, sandbox_path;
        if (description || void 0) {
          description = {};
        }
        sandbox_path = path.split(".");
        name = sandbox_path.pop();
        if (!this.is_valid_name(name)) {
          return false;
        }
        description.name = name;
        description.path = path;
        description.parent = sandbox_path.join(".");
        this.cast_require(description);
        return description;
      }
    };
    modules_ready_events = function(modules_list) {
      return _.map(modules_list, function(module_name) {
        return helpers.module_ready_event_name(module_name);
      }).join(" ");
    };
    all_sandboxes = {
      root: null,
      list: {},
      get: function(module_path) {
        if (!module_path) {
          this.root;
        }
        return this.list[module_path] || null;
      },
      add: function(description, sandbox) {
        if (this.root === null) {
          this.root = sandbox;
          return true;
        } else if (!this.list[description.path]) {
          this.list[description.path] = sandbox;
          return true;
        }
        return false;
      }
    };
    window.modulus.trail(function(sandbox, description, actions) {
      if (!all_sandboxes.add(description, sandbox)) {
        return;
      }
      sandbox.create_aliace = function(aliace) {
        return alliaces[this.path] = aliace;
      };
      actions.push(function(module_path, module, new_description) {
        var events, self;
        if (!_.isString(module_path) || !_.isFunction(module) || all_sandboxes.list[module_path]) {
          return;
        }
        description = _helpers.cast_description(module_path, new_description);
        self = this;
        debug("pending_module", description);
        events = modules_ready_events(description.require) || "";
        events = description.init_event ? events + " " + description.init_event : events;
        return this.wait(events, function(modules) {
          var init_data, module_ready_event_data, module_sandbox, parent;
          parent = all_sandboxes.get(description.parent);
          module_sandbox = sandboxes.create(description);
          module_sandbox[description.parent] = parent.module;
          module_sandbox.parent = parent;
          _.each(modules, function(info) {
            var alliace, root_name;
            if (info.path) {
              root_name = info.path.split(".")[0];
              module_sandbox[root_name] = all_sandboxes.get(root_name).module;
              alliace = description.alliaces[info.path] || alliaces[info.path];
              if (alliace) {
                return module_sandbox[alliace] = info.module;
              }
            }
          });
          init_data = {};
          if (description.init_event) {
            init_data = modules[description.init_event];
          }
          module_sandbox.module = module.call(module_sandbox, module_sandbox, init_data);
          module_sandbox[module_sandbox.module_name] = module_sandbox.module;
          if (parent.module) {
            parent.module[module_sandbox.module_name] = module_sandbox.module;
          } else {
            parent[module_sandbox.module_name] = module_sandbox.module;
          }
          module_ready_event_data = {
            path: module_sandbox.path,
            name: module_sandbox.module_name,
            module: module_sandbox.module
          };
          module_sandbox.pub(helpers.module_ready_event_name(module_sandbox.path), module_ready_event_data, {
            is_state: true
          });
          parent.pub(parent.path + ":child:ready", module_ready_event_data);
          return debug("ready_module", description.path);
        });
      });
      return actions.push(function(anonym_module, description) {
        if (!_.isFunction(anonym_module)) {

        }
      });
    });
    return window.modulus.modules = function(module_path) {
      return all_sandboxes.get(module_path);
    };
  });

}).call(this);
