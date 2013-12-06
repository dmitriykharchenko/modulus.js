window.modulus = new () ->
  is_test_mode = window.TESTMODE or /_testmode_/g.test(location.search) or false

  # words, witch can't be usead as application module names
  reserved_names = []



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
        sandbox_arguments = arguments

        _.each actions, (action) ->
          action.apply sandbox, sandbox_arguments

      # exposiong debug module to every sandbox
      sandbox.debug = debug

      # extending sandbox by set of trail functions
      _.each trailers, (trailer) ->
        sandbox = trailer(sandbox, description, actions) or sandbox
      
      sandbox


      create: create_sandbox,
      trail: (trailer) ->
        trailers.push trailer
  

  # usefull core module for asyncronus work
  # allows to call asyncronus code faster than setTimeout with zero delay

  set_zero_timeout = new (sandbox) ->
    timeouts = []
    messageName = "zero-timeout-message-" + new Date().getTime()

    zero_timeouts_count = 1000
    counter = 0

    # every 1000 times call old setTimeout.
    # To prevent errors in slow browsers like IE.

    set_zero_timeout = (fn) ->

      counter--
      if counter < 0
        counter = zero_timeouts_count
        return setTimeout fn, 10

      else
        timeouts.push fn
        return window.postMessage messageName, "*"
   
    handle_message = (event) ->
      if event.data is messageName
        event.cancelBubble = true
        event.returnValue = false

        if event.stopPropagation
          event.stopPropagation()

        if event.preventDefault
          event.preventDefault()

        if 0 < timeouts.length
          fn = timeouts.shift()
          fn()

   
    if window.addEventListener
      window.addEventListener "message", handle_message, true

    else if window.attachEvent  # IE before version 9
      zero_timeouts_count = 0
      window.attachEvent "onmessage", handle_message

    reserved_names.push "set_zero_timeout"

    # append trail function to sandboxes module,
    # adds set_zero_timeout to every sandbox.

    sandboxes.trail (sandbox) ->
      sandbox.set_zero_timeout = set_zero_timeout
   
    set_zero_timeout
  

  helpers =

    # generates module ready event

    module_ready_event_name: (path) ->
      ["module", path or "core", "ready"].join ":"



  # module for supporting application events
  events = new () ->

    # adds more reserved names
    reserved_names = reserved_names.concat ["unbind", "bind", "trigger", "pub", "sub", "unsub", "wait"]

    # stores handlers and states
    # state is last data of some event.

    events_hash =
      handlers: {}
      states: {}

    # prepares params to easilly bind handler to set of events
    # If params have is_wait field set to true, 
    # then handler fires only after all events has been fired, not after every,
    # usefull when you need to wait for some depencies

    prepare_bind_params = (events, handler, params) ->
      if not _.isString events
        return events
      
      params = params or { is_wait: false }
      params.is_wait = params.is_wait && _.isFunction handler

      all_events = _.compact events.split /\s+/

      if params.is_wait
        waiter = handler
        event_data = {}
        handler = (data) ->
          event = _.last arguments
          all_events = _.without all_events, event.name
          event_data[event.name] = data

          if all_events.length is 0
            waiter event_data,
              name: events

      bind_hash = {}
      _.each all_events, (name) ->
        bind_hash[name] = handler

      bind_hash


    # calls handler and logs time of it execution

    handler_call = (handler, name, data) ->
      start = +new Date()
      event_data = { name: name }
      handler_params = []

      if _.isArray data
        handler_params = data
      else
        handler_params.push data
      
      handler_params.push event_data
      handler.apply event_data, handler_params
      debug "logs", "execution time", +new Date() - start, name, handler


    # events module interface with familiar bing, unbind, trigger methods
    # and also wait method, witch is shortcut to calling bind method with is_wait param.
    # bind and trigger methods logs events names and passed arguments

    events =
      bind: (events, handler, params) ->
        debug "logs", "bind", arguments, @name
        bind_hash = prepare_bind_params events, handler, params

        _.each bind_hash, (handler, name) ->
          if events_hash.states[name]
            handler_call(handler, name, events_hash.states[name]);
          
          handler.id = handler.id or _.uniqueId(name + "_handler_")

          events_hash.handlers[name] = events_hash.handlers[name] or {}
          events_hash.handlers[name][handler.id] = handler


      unbind: (event_name, handler) ->
        id = handler.id
        if not id or not events_hash.handlers[event_name]
          return
  
        delete events_hash.handlers[event_name][id]

      trigger: (event_name, data, params) ->
        debug("logs","trigger", arguments, @name)

        params = params or {}
        data = data or {}
        if params.is_state
          events_hash.states[event_name] = data
        
        handlers_list = events_hash.handlers[event_name] or {}

        caller = (handler) ->
          handler_call handler, event_name, data

        _.each handlers_list, if params.is_sync then  caller else (handler) ->
          set_zero_timeout () ->
            caller handler


      wait: (events_list, handler, options) ->
        return if events_list then events.bind(events_list, handler, _.extend(options || {}, {is_wait: true})) else handler {}

    # trail function, appends events support to every sandbox,
    # also creates alliaces for events methods

    sandboxes.trail (sandbox) ->
      sandbox.unsub = sandbox.unbind = events.unbind;
      sandbox.sub = sandbox.bind = events.bind;
      sandbox.pub = sandbox.trigger = events.trigger;
      sandbox.wait = events.wait;

    return events


  
  # modules core module.
  # made for support application modules.
  # For now is the most complex core module.

  modules = new () ->
    alliaces = {}

    _helpers =

      # check is name is not from reserved_names list

      is_valid_name: (name) ->
        return _.indexOf(reserved_names, name) < 0

      # casts require field from module description,
      # for easier depencies requiring

      cast_require: (description) ->
        description.require = description.require or []
        description.alliaces = {}
        require_extention = []

        self = @

        if description.config
          alliaces[description.config] = "config"
          description.require.push description.config
        
        _.each description.require, (module_name) ->
          if not _.isString module_name
            _.extend description.alliaces, module_name
   
        description.require = description.require.concat require_extention

        if description.parent
          description.require.push description.parent



      # casts description
      # appends parent, name, path fields, 
      # based on module path

      cast_description: (path, description) ->
        if description or undefined
          description = {}

        sandbox_path = path.split(".")
        name = sandbox_path.pop()

        if not @is_valid_name name
          return false
        
        description.name = name
        description.path = path
        description.parent = sandbox_path.join(".")
        @cast_require(description)

        description


    # creates module depencies events list to wait for

    modules_ready_events = (modules_list) ->
      _.map modules_list, (module_name) ->
        helpers.module_ready_event_name module_name
      .join " "


    # stores application modules sandboxes

    all_sandboxes =
      root: null
      list: {}
      get: (module_path) ->
        if not module_path
          @root
        
        return @list[module_path] or null


      add: (description, sandbox) ->
        if @root is null
          @root = sandbox
          return true

        else if not @list[description.path]
          @list[description.path] = sandbox
          return true
  
        return false


    # trail functions witch adds modules support to every sandbox.
    # after it every sandbox may be root for any number of modules

    sandboxes.trail (sandbox, description, actions) ->

      # returns if module with such discription.path already exists 

      return if not all_sandboxes.add description, sandbox
      
      # creates aliace for current application module

      sandbox.create_aliace = (aliace) ->
        alliaces[@path] = aliace

      # action for creating new module

      actions.push (module_path, module, new_description) ->
        return if not _.isString(module_path) or not _.isFunction(module) or all_sandboxes.list[module_path]

        description = _helpers.cast_description module_path, new_description

        self = @

        debug "pending_module", description

        # depency ready events

        events = modules_ready_events(description.require) or ""
        events = if description.init_event then events + " " + description.init_event else events

        # after all depency are ready, sandbox starts creation of new module.
        # handler creates module sandbox, extends it with all depencies,
        # if module have init_event, handler ads data from event to module function.

        @wait events, (modules) ->
          parent = all_sandboxes.get description.parent
          module_sandbox = sandboxes.create description

          module_sandbox[description.parent] = parent.module
          module_sandbox.parent = parent
          _.each modules, (info) ->
            if info.path
              root_name = info.path.split(".")[0]
              module_sandbox[root_name] = all_sandboxes.get(root_name).module
              alliace = description.alliaces[info.path] or alliaces[info.path]
              if alliace
                module_sandbox[alliace] = info.module


          init_data = {}

          if description.init_event 
            init_data = modules[description.init_event]


          module_sandbox.module = module.call module_sandbox, module_sandbox, init_data
          module_sandbox[module_sandbox.module_name] = module_sandbox.module

          if parent.module
            parent.module[module_sandbox.module_name] = module_sandbox.module
          else
            parent[module_sandbox.module_name] = module_sandbox.module

          module_ready_event_data =
            path: module_sandbox.path
            name: module_sandbox.module_name
            module: module_sandbox.module

          # pubs module ready events

          module_sandbox.pub helpers.module_ready_event_name(module_sandbox.path), module_ready_event_data, { is_state: true }

          parent.pub parent.path + ":child:ready", module_ready_event_data

          # logs ready module event
          debug "ready_module", description.path

      
      actions.push (anonym_module, description) ->
        return if not _.isFunction anonym_module


    # core module interface
    # returns application modules sandboxes by paths

    (module_path) ->
      all_sandboxes.get module_path



  # core module that allows to make sandbox extentions for child modules.
  # Those extentions are available only for child modules through their sandboxes.

  sandbox_extentions = new () ->
    extentions = 
      _root:
        extention: {}
    
      add: (path, extention) ->
        if path is ""
          _.extend @root.extention, extention
        
        ext_root = @_root

        _.each path.split("."), (name) ->
          if not ext_root[name]
            ext_root[name] =
              extention: {}

          ext_root = ext_root[name]

        _.extend ext_root.extention, extention

      get: (path) ->
        extentions = [{}]
        ext_root = @_root

        _.find path.split("."), (name) ->
          if ext_root
            extentions.push(ext_root.extention);
            ext_root = ext_root[name];
          else
            return true

        if extentions.length isnt 0
          return _.extend.apply _, [{}].concat extentions
        
        null

    add_extention = (extention) ->
      extentions.add @path or "", extention or {}
    

    sandboxes.trail (sandbox, description, actions) ->
      if description.path
        sandbox_extention = extentions.get description.path

        if sandbox_extention
          _.extend sandbox, sandbox_extention
        
        sandbox.extention = add_extention;

    extentions


  
  # tiny core module, that appends set of helpers 
  # for dom manipulation to every sandbox

  module_dom_selectors = new () ->
    sandboxes.trail (sandbox) ->
      sandbox.self_markup_dom_selector = () ->
        return @path.replace /\:/g, "\\:"

      sandbox.self_data_attr_name = () ->
        return @path.replace /\./g, '-' 
  
      sandbox.self_attr_dom_selector = () ->
        return "[data-" + @self_data_attr_name() + "]"



  # core module made to help testing appliction module and core itself
  # exposes core modules and gives interface to expose application modules internals

  tests = new () ->
    tests_data = {}
    reserved_names.push "test"

    test = (test_obj) ->
      test_obj.sandbox = this
      tests_data[@path] = test_obj

    test.get = (path) ->
      return tests_data[path] or {
        sandbox: modules.get path
      }


    # exposing core modules
    test.core_inner =
      sandboxes: sandboxes
      events: events
      modules: modules
      module_dom_selectors: module_dom_selectors
      sandbox_extentions: sandbox_extentions
      debug: debug


    sandboxes.trail (sandbox) ->
      sandbox.test = is_test_mode ? test : (() ->)


  # The modulus itself is root sandbox

  sandboxes.create
    name: "core"

window.M = modulus