window.modulus = new () ->

  #### Debug core module
  # Usefull for logging application events.
  # Helps to find uninitialized modules and some performance lacks
  # works only if test mode was enabled for performance sake

  debug = if not is_test_mode then (() ->) else new () ->

    state =
      logs: {}
      modules:
        ready: {}
        pending: {}

    loggers =

      # default logger for all kind of events,
      # logs time, data, and name of event.
      # writes events in different logs

      log: (log_type) ->
        data = _.rest arguments
        if not state.logs[log_type]
          state.logs[log_type] = [];
        
        state.logs[log_type].push
          name: log_type,
          time: +new Date(),
          ready_time: null,
          data: data


    debug_interface = (logger_name) ->
      logger = loggers[logger_name] or loggers.log
      logger.apply {}, _.rest arguments


    debug_interface.add_logger = (name, handler) ->
      loggers[name] = handler


    debug_interface.state = state
    
    debug_interface


  # scopes core module
  # creates scopes for application modules,
  # and extends it with new functionality,
  # witch may be appended by another core modules.

  scopes = new () ->

    # set of functions for extend sanbox
    # they accepts following arguments: scope, description and set of scope actions (array)

    trailers = []
    scopes = []

    # first trailer function,
    # witch appends to scope the module name, module path and discription of this scope

    trailers.push (scope, description) ->
      _.extend scope,
        module_name: description.name,
        path: description.path,
        scope_description: description

    # sanbox creation function.
    # scope is javascript function extended with some special fields
    # action of scope function may be extended by trailer function.

    create_scope = (description) ->
      actions = []

      # creating scope itself.
      # just a simple function, witch can call own set of actions

      scope = () ->

        for action in actions
          action.apply scope, arguments

        # exposiong debug module to every scope
        scope.debug = debug

        scope.M_actions = actions
        scope.M_description = description

        # extending scope by set of trail functions
        _.each trailers, (trailer) ->
          scope = trailer(scope, description, actions) or scope
        
        scopes.push scope

        scope


      create: create_scope,
      trail: (trailer) ->
        trailers.push trailer

        for scope in scopes
          trailer scope, scope.M_description, scope.M_actions


    scope.create
      name: "core"