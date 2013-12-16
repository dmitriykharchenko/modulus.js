module.exports = function(grunt) {
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-coffee');

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),

    coffee: {
      compile: {
        expand: true,
        flatten: false,
        cwd: 'src/',
        src: ['**/**.coffee'],
        dest: 'dist/',
        ext: '.js'
      }
    },


    concat: {
      javascripts: {
        options: {
          separator: ';'
        },
        files: {
          'dist/release.modulus.js': [
            "dist/core.js",
            "dist/events.js",
            "dist/modules.js",
            "dist/tests.js",
          ]
        }
      }
    },

    watch: {
      scripts: {
        files: [ 'src/**/**.coffee', 'test/**/**.js'],
        tasks: ['build'],
        options: {
          atBegin: true
        }
      }
    }

  });

  grunt.event.on('watch', function(action, filepath, target) {
    grunt.log.writeln(target + ': ' + filepath + ' has ' + action);
  });

  grunt.registerTask('build', ['coffee', 'concat:javascripts']);
};
