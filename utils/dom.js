M("utils.dom", function(M){
  if(window.$){
    $(function(){
      M.trigger("dom:ready", {}, {is_state: true});
    });
  }
});