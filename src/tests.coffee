# core module made to help testing appliction module and core itself
# exposes core modules and gives interface to expose application modules internals

new () ->
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


  window.modulus.trail (sandbox) ->
    sandbox.test = is_test_mode ? test : (() ->)