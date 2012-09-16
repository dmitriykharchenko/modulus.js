M("widgets", function(M){
  var handlers = [];
  var events = [];

  var autoinit = function(handler, additional_events){
    handlers.push(handler);
    _.each(events.concat(additional_events), function(event_data){
      var event_name = _.isString(event_data) ? event_data : event_data.name;
      M.sub(event_name, function(){
        handler($(event_data.selector || "body"));
      });
    });
  };

  autoinit.add_event = function(name, selector){
    events.push({
      name: name,
      selector: selector
    });
    _.each(handlers, function(handler){
      M.sub(name, function(){
        handler($(selector || "body"));
      });
    });
  };

  autoinit.add_event("dom:ready", "body");

  var auto_create = function(constructor, init_event){
    var name = this.path;
    var data_attr_name = this.path.replace(/\./g, "-");
    var selector = "[data-" + data_attr_name + "]";

    var widget_list = {};

    var create_widget = function(layout_or_selector, options){
      var layout = $(layout_or_selector);
      var id = layout.data(widget_name + "_id");
      if(!widget_list[id]){
        var widget = constructor(layout, options || layout.data(data_attr_name));
        layout.data(widget_name + "_id", widget.id);
        id = widget.id;
        widget_list[widget.id] = widget;
      }
      return widget_list[id];
    };

    autoinit(function(container){
      container.find(selector).each(function(){
        create_widget($(this));
      });
    }, init_event);

    return create_widget;
  };
  M.extend({
    autoinit: autoinit,
    auto_create: auto_create
  });
  return {};
});