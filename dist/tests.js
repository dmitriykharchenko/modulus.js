(function() {
  new (function() {
    var test, tests_data;
    tests_data = {};
    reserved_names.push("test");
    test = function(test_obj) {
      test_obj.sandbox = this;
      return tests_data[this.path] = test_obj;
    };
    test.get = function(path) {
      return tests_data[path] || {
        sandbox: modules.get(path)
      };
    };
    test.core_inner = {
      sandboxes: sandboxes,
      modules: modules,
      module_dom_selectors: module_dom_selectors,
      sandbox_extentions: sandbox_extentions,
      debug: debug
    };
    return window.modulus.trail(function(sandbox) {
      return sandbox.test = typeof is_test_mode !== "undefined" && is_test_mode !== null ? is_test_mode : {
        test: (function() {})
      };
    });
  });

}).call(this);
