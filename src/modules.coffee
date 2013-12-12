# modules core module.
# made for support application modules.
# For now is the most complex core module.

new () ->
  alliaces = {}

  _helpers =

    # logger for pending modules
    # indicates witch modules are waiting for their depencies

    scope.add_logger "pending_module", (description) ->
      data = _.clone description
      data.pending_time = +new Date()
      state.modules.pending[data.path] = data


    # logger for ready modules
    # removes info about module from pending modules log and ads to 
    # ready modules log
    
    scope.add_logger "ready_module", (name) ->
      pending_data = state.modules.pending[name] or {}
      pending_data.ready_time = +new Date()
      state.modules.ready[name] = pending_data
      delete state.modules.pending[name]


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

  window.modulus.trail (sandbox, description, actions) ->

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

  window.modulus.modules = (module_path) ->
    all_sandboxes.get module_path