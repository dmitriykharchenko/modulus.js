window.modulus = new () ->
  is_test_mode = window.TESTMODE or /_testmode_/g.test(location.search) or false

  # words, witch can't be usead as application module names
  reserved_names = []
  

  helpers =

    # generates module ready event

    module_ready_event_name: (path) ->
      ["module", path or "core", "ready"].join ":"



  # module for supporting application events
  # injecting mangra events to sandbox

  events = new () ->

    # trail function, appends events support to every sandbox,
    # also creates alliaces for events methods

    sandboxes.trail (sandbox) ->
      mangra.init sandbox

    return events


  
  # modules core module.
  # made for support application modules.
  # For now is the most complex core module.

  modules = new () ->
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