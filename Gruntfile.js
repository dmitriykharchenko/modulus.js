module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-coffee');

  grunt.loadTasks('./grunt_tasks/');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    clean: {
      tmp: ['tmp'],
      fonts: ['public/fonts', 'tmp/fonts'],
      javascripts: ['public/javascripts', 'tmp/javascripts'],
      images: ['public/images', 'tmp/images'],
      stylesheets: ['public/stylesheets', 'tmp/stylesheets']
    },

    copy: {
      styles: {
        expand: true,
        src: '**/**.css',
        dest: 'tmp/stylesheets/',
        cwd: assets.css
      },
      scripts: {
        expand: true,
        src: '**/**.js',
        dest: 'tmp/javascripts/',
        cwd: assets.js
      },
      fonts: {
        expand: true,
        src: '**',
        dest: 'public/font/',
        cwd: "assets/fonts/"
      },
      images: {
        expand: true,
        src: '**',
        dest: 'public/images/',
        cwd: "assets/images/"
      }
    },

    uglify: {
      options: {
        mangle: {
          except: ['jQuery', 'Backbone', 'angular']
        }
      },
      javascripts: {
        files: {
          'public/javascripts/app-min.js': [
            'public/javascripts/lib.js',
            'public/javascripts/app.js'
          ]
        }
      }
    },

    coffee: {
      compile: {
        expand: true,
        flatten: false,
        cwd: assets.js,
        src: ['**/**.coffee'],
        dest: 'tmp/javascripts/',
        ext: '.js'
      }
    },

    stylus: {
      compile: {
        expand: true,
        linenos: true,
        flatten: false,
        cwd: assets.css,
        src: ['**/**.styl'],
        dest: 'tmp/stylesheets/',
        ext: '.css'
      }
    },

    concat: {
      javascripts: {
        options: {
          separator: ';'
        },
        files: {
          'public/javascripts/app.js': [
            "tmp/javascripts/init.js",
            "tmp/javascripts/**/**.js",
          ],
          'public/javascripts/lib.js': [
            "assets/lib/jquery/jquery.js",
            "assets/lib/underscore/underscore.js"
          ]
        }
      },

      stylesheets: {
        files: {
          'public/stylesheets/app.css': [
            "assets/lib/bootstrap/dist/css/bootstrap.css",
            "assets/lib/bootstrap/dist/css/bootstrap-theme.css",
            "tmp/stylesheets/base.css",
            "tmp/stylesheets/**/**.css"
          ]
        }
      }
    },

    watch: {
      images: {
        files: [ assets.images + '**/**' ],
        tasks: ['compile_images'],
        options: {
          atBegin: true
        }
      },
      fonts: {
        files: [ assets.fonts + '**/**'],
        tasks: ['compile_fonts'],
        options: {
          atBegin: true
        }
      },
      stylesheets: {
        files: [ assets.css + '**/**.css', assets.css + '/**/**.styl'],
        tasks: ['compile_styles'],
        options: {
          atBegin: true
        }
      },
      scripts: {
        files: [ assets.js + '**/**.js', assets.js + '**/**.coffee', 'test/**/**.js'],
        tasks: ['compile_javascripts'],
        options: {
          atBegin: true
        }
      }
    },

    // CSSLint
    // -------
    csslint: {
      all: 'public/stylesheets/app.css',
      options: {
        absoluteFilePathsForFormatters: true,
        formatters: [
          {id: 'lint-xml', dest: '../stylesheetslint.xml'}
        ]
      }
    },
    // end csslint

    // JSHint
    // ------
    jshint: {
      all: 'public/javascripts/app.js',
      options: {
        reporter: 'jslint',
        reporterOutput: '../javascriptslint.xml'
      }
    }
    // end jshint


  });

  grunt.event.on('watch', function(action, filepath, target) {
    grunt.log.writeln(target + ': ' + filepath + ' has ' + action);
  });

  grunt.registerTask('compile_javascripts', ['clean:javascripts', 'coffee', 'copy:scripts', 'concat:javascripts']);

  grunt.registerTask('compile_styles', ['clean:stylesheets', 'stylus', 'copy:styles', 'concat:stylesheets']);
  grunt.registerTask('compile_images', ['clean:images', 'copy:images']);
  grunt.registerTask('compile_fonts', ['clean:fonts', 'copy:fonts'])
  grunt.registerTask('compile', ['compile_javascripts', 'compile_styles']);
  grunt.registerTask('compress', ['compile', 'uglify']);

  grunt.registerTask('build', ['compress', 'compile_images', 'compile_fonts']);

};
