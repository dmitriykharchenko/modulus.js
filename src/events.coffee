# module for supporting application events
# injecting mangra events to sandbox

new () ->

    # trail function, appends events support to every sandbox
    window.modulus.trail (sandbox) ->
      mangra.init sandbox