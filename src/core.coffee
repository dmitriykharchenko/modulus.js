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

      # logger for pending modules
      # indicates witch modules are waiting for their depencies

      pending_module: (description) ->
        data = _.clone description
        data.pending_time = +new Date()
        state.modules.pending[data.path] = data

      # logger for ready modules
      # removes info about module from pending modules log and ads to 
      # ready modules log

      ready_module: (name) ->
        pending_data = state.modules.pending[name] or {}
        pending_data.ready_time = +new Date()
        state.modules.ready[name] = pending_data
        delete state.modules.pending[name]


    debug_interface = (type) ->
      logger = loggers[type] or loggers.log
      logger.apply(loggers, _.rest(arguments))


    debug_interface.state = state
    
    debug_interface


  # sandboxes core module
  # creates sandboxes for application modules,
  # and extends it with new functionality,
  # witch may be appended by another core modules.

  sandboxes = new () ->

    # set of functions for extend sanbox
    # they accepts following arguments: sandbox, description and set of sandbox actions (array)
    
    trailers = []
    sandboxes = []

    # first trailer function,
    # witch appends to sandbox the module name, module path and discription of this sandbox

    trailers.push (sandbox, description) ->
      _.extend sandbox,
        module_name: description.name,
        path: description.path,
        sandbox_description: description

    # sanbox creation function.
    # sandbox is javascript function extended with some special fields
    # action of sandbox function may be extended by trailer function.

    create_sandbox = (description) ->
      actions = []

      # creating sandbox itself.
      # just a simple function, witch can call own set of actions

      sandbox = () ->

        for action in actions
          action.apply sandbox, arguments

        # exposiong debug module to every sandbox
        sandbox.debug = debug

        sandbox.M_actions = actions
        sandbox.M_description = description

        # extending sandbox by set of trail functions
        _.each trailers, (trailer) ->
          sandbox = trailer(sandbox, description, actions) or sandbox
        
        sandboxes.push sandbox

        sandbox


      create: create_sandbox,
      trail: (trailer) ->
        trailers.push trailer

        for sandbox in sandboxes
          trailer sandbox, sandbox.M_description, sandbox.M_actions


    sandbox.create
      name: "core"