(function() {
  window.modulus = new function() {
    var debug, scopes;
    debug = !is_test_mode ? (function() {}) : new function() {
      var debug_interface, loggers, state;
      state = {
        logs: {},
        modules: {
          ready: {},
          pending: {}
        }
      };
      loggers = {
        log: function(log_type) {
          var data;
          data = _.rest(arguments);
          if (!state.logs[log_type]) {
            state.logs[log_type] = [];
          }
          return state.logs[log_type].push({
            name: log_type,
            time: +new Date(),
            ready_time: null,
            data: data
          });
        }
      };
      debug_interface = function(logger_name) {
        var logger;
        logger = loggers[logger_name] || loggers.log;
        return logger.apply({}, _.rest(arguments));
      };
      debug_interface.add_logger = function(name, handler) {
        return loggers[name] = handler;
      };
      debug_interface.state = state;
      return debug_interface;
    };
    return scopes = new function() {
      var create_scope, root_scope, trailers;
      trailers = [];
      scopes = [];
      trailers.push(function(scope, description) {
        return _.extend(scope, {
          module_name: description.name,
          path: description.path,
          scope_description: description
        });
      });
      create_scope = function(description) {
        var actions, scope;
        actions = [];
        scope = function() {
          var action, _i, _len;
          for (_i = 0, _len = actions.length; _i < _len; _i++) {
            action = actions[_i];
            action.apply(scope, arguments);
          }
          scope.debug = debug;
          scope.M_actions = actions;
          scope.M_description = description;
          _.each(trailers, function(trailer) {
            return scope = trailer(scope, description, actions) || scope;
          });
          scopes.push(scope);
          return scope;
        };
        return {
          create: create_scope,
          trail: function(trailer) {
            var _i, _len, _results;
            trailers.push(trailer);
            _results = [];
            for (_i = 0, _len = scopes.length; _i < _len; _i++) {
              scope = scopes[_i];
              _results.push(trailer(scope, scope.M_description, scope.M_actions));
            }
            return _results;
          }
        };
      };
      return root_scope = scope.create({
        name: "core"
      });
    };
  };

}).call(this);
