//= require nano_ui/utils/index

NANO("utils.async", function(NANO){
  var batch_balancer = function(){};
  batch_balancer.prototype = {
    _start_time: 0,
    _end_time: 0,
    _limit: 30,
    _last_batch_size: 0,
    batch_size: function(){
      if(this._last_batch_size === 0){
        this._last_batch_size = 1;
      } else {
        var time = Math.max(this._end_time - this._start_time, 1);
        this._last_batch_size = Math.max((this._limit / time) * this._last_batch_size, 1);
      }
      return this._last_batch_size;
    },
    start: function(){
      this._start_time = +new Date();
    },
    stop: function(){
      this._end_time = +new Date();
    }
  };

  var async_iterate = function(iterator, complete){
    var keys;
    var is_stop = false;
    var balancer = new batch_balancer();
    var state = {};
    if(!_.isFunction(iterator)){
      state.is_complete = true;
      is_stop = true;
    }

    var complete_handlers = [];

    if(_.isFunction(complete)){
      complete_handlers.push(complete);
    }

    var iteration_complete = function(){
      state.is_complete = true;
      is_stop = true;
      if(0 < complete_handlers.length){
        var handler = complete_handlers.shift();
        _.defer(function(){
          handler(state);
          iteration_complete();
        });
      }
    };

    var iteration = function(){
      var next_index = null;
      var batch_size = balancer.batch_size();
      balancer.start();
      while(batch_size){
        next_index = keys.shift();
        if(!_.isUndefined(next_index) && !is_stop){
          var result = iterator.call(state, state.data[next_index], next_index);
          if(result){
            state.result[next_index] = result;
          }
          batch_size --;
        } else {
          iteration_complete();
          return state;
        }
      }
      balancer.stop();
      NANO.set_zero_timeout(iteration);
    };

    iteration.iterator = iterator;
    iteration.complete = function(handler){
      if(state.is_complete){
        handler(state);
      } else {
        complete_handlers.push(handler);
      }
    };
    iteration.stop = function(){
      is_stop = true;
    };
    iteration.state = state;
    return function(data){
      state.data = data;
      if(state.is_complete){
        state.result = state.data;
        iteration_complete();
      } else {
        keys = data ? _.keys(data) : [];
        iteration();
      }
    };
  };


  var worker = function(data){
    this._last_iteration = async_iterate(data || []);
  };

  worker.prototype = {
    _push: function(data){
      var new_iteration = async_iterate(data.iterator, data.complete);
      this._last_iteration.complete(function(state){
        next_iteration(state.result);
      });
      this._last_iteration = new_iteration;
      return this;
    },
    then: function(handler){
      return this._push({
        complete: function(state){
          var data = handler(state.result);
          if(data){
            state.result = data;
          }
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
        iterator: function(value, index){
          return iterator(value, index);
        }
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
  return worker;
});