//= require nano_ui/utils/index

NANO("utils.async", function(NANO){
  var BatchBalancer = function(limit){
    this._start_time = +new Date();
    this._limit = limit || 50;
  };
  BatchBalancer.prototype = {
    start: function(callback){
      var call_date = +new Date();
      if(this._limit < (call_date - this._start_time)){
        this._start_time = call_date;
        NANO.set_zero_timeout(callback);
      } else {
        callback();
      }
    }
  };

  var async_iterate = function(iterator, complete){
    var keys;
    var balancer = null;
    var state = {
      is_complete: false
    };

    var complete_handlers = [];

    if(_.isFunction(complete)){
      complete_handlers.push(complete);
    }

    var call_complete_handlers = function(){
      if(0 < complete_handlers.length){
        var handler = complete_handlers.shift();
        handler(state);
        call_complete_handlers();
      }
    };

    var iteration_complete = function(){
      if(!state.result){
        state.result = state.data;
      }
      call_complete_handlers();
    };
    var iteration = _.isFunction(iterator) ? function(){      
      if(keys.length !== 0 && !state.is_complete){
        var next_index = keys.shift();
        var result = iterator(state.data[next_index], next_index);
        if(result !== undefined){
          if(!state.result){
            state.result = _.isArray(state.data) ? [] : {};
          }
          state.result[next_index] = result;
        }
      } else {
        state.is_complete = true;
        iteration_complete();
        return state;
      }
      balancer.start(iteration);
    } : function(){
      state.is_complete = true;
      state.result = state.data;
      iteration_complete();
      return state;
    };

    var iteration_initializer = function(data, batch_balancer){
      balancer = batch_balancer || new BatchBalancer();
      state.data = data;
      keys = _.isArray(data) || _.isObject(data) ? _.keys(state.data) : [];
      balancer.start(iteration);
    };

    iteration_initializer.iterator = iterator;
    iteration_initializer.complete = function(handler){
      complete_handlers.push(handler);
      if(state.is_complete){
        iteration_complete();
      }
    };
    iteration_initializer.stop = function(){
      state.is_complete = true;
    };
    iteration_initializer.state = state;
    return iteration_initializer;
  };


  var Worker = function(data){
    this._last_iteration = async_iterate();
    this._last_iteration(data || []);
    this._balancer = new BatchBalancer();
  };

  Worker.prototype = {
    _push: function(data){
      var new_iteration = async_iterate(data.iterator, data.complete);
      this._last_iteration.complete(function(state){
        new_iteration(state.result, self._balancer);
      });
      this._last_iteration = new_iteration;
      return this;
    },
    then: function(handler){
      return this._push({
        complete: function(state){
          var data = handler(state.result);
          state.result = !_.isUndefined(data) ? data : state.data;
        }
      });
    },
    pick: function(data){
      return this._push({
        complete: function(state){
          state.result = data;
        }
      });
    },
    each: function(iterator){
      return this._push({
        iterator: function(value, index){
          var data = iterator(value, index);
          if(data === false){
            this.stop();
          }
        }
      });
    },
    map: function(iterator){
      return this._push({
        iterator: iterator
      });
    },
    reduce: function(iterator){
      var summary;
      return this._push({
        iterator: function(value, index){
          summary = iterator(value, index, summary);
        },
        complete: function(state){
          state.result = summary;
        }
      });
    },
    find: function(iterator){
      var found;
      return this._push({
        iterator: function(value, index){
          if(iterator(value, index)){
            found = value;
          }
        },
        complete: function(state){
          state.result = found;
        }
      });
    },
    complete: function(handler){
      return this._push({
        complete: function(state){
          handler(state.result);
        }
      });
    }
  };
  return function(data){
    return new Worker(data);
  };
});