var Hook = require('hook.io').Hook,
    util = require('util'),
    async = require('async'),
    GitHubApi = require('github'),
    request = require('request');

/**
* @@TODO
*
* - incorporate hook.io-markdown and remove markdown code
* - README
* - abstract the readme-finder portion so it can find any file in a repo and return the raw version
* - make attaching the readme an optional piece of functionality
*/


var GithubHook = exports.GithubHook = function GithubHook(options) {

  var self = this;
  Hook.call(this, options);

  this.configReady = false;

  self.on('hook::ready', function () {
    if (!!options.configFilePath && options.configFilePath.length) {
      self.config.use('file', { file: options.configFilePath });
      self.config.load(function (err, contents) {
        if (err) {
          // @@TODO
          throw new Error(err);
        }

        self.configReady = true;
        
        // call it now
        self.getAllItems();

        // and call it later
        self.on('getAllItems', self.getAllItems.bind(self));
        self.on('*::getAllItems', self.getAllItems.bind(self));
      });
    }
  });
};

//
// Inherit from `hookio.Hook`
//
util.inherits(GithubHook, Hook);

GithubHook.prototype.findReadme = function (user, repo, cb) {
  var self = this;
  async.waterfall(
    [ self.findMasterBranchSHA.bind(this, user, repo),
      self.findReadmeBlobsInTree.bind(this, user, repo),
      self.findReadmeFilesOfPreferredFormats.bind(this),
      self.decodeReadmeBase64.bind(this, user, repo),
      self.parseToGithubHookFlavoredMarkdown.bind(this, user, repo),
      self.addStylesheetsAndHTMLLayout.bind(this)
    ], cb);
}

GithubHook.prototype.addStylesheetsAndHTMLLayout = function (html, cb) {
  html = '<article class="markdown-body entry-content" itemprop="mainContentOfPage">' + html + '</article>';

  var css = require('fs').readFileSync(__dirname + '/github.css');
  html = '<html><head><style>' + css + '</style></head><body>' + html + '</body></html>';
  cb(null, html);
}

GithubHook.prototype.parseToGithubHookFlavoredMarkdown = function (user, repo, md, cb) {
  var ghm = require('github-flavored-markdown');
  var rendered = ghm.parse(md, [user, repo].join('/'));
  cb(null, rendered);
}

GithubHook.prototype.decodeReadmeBase64 = function (user, repo, readmeFilename, cb) {
  request('https://raw.github.com/' + user + '/' + repo + '/master/' + readmeFilename, function (err, resp, body) {
    body = body || ' ';
    return cb(null, body);
  });
  /*var githubApi = new GitHubApi({ version: "3.0.0" });
  githubApi.gitdata.getBlob(
    { user: user,
      repo: repo,
      sha: readmeSHA },
    function (err, result) {
      if (result.encoding == 'base64') {
        var decoded = new Buffer(result.content.length);
        decoded.write(result.content, 0, result.content.length, 'base64');
        decoded = decoded.toString('ascii'); // remove null bytes that are everywhere
        //decoded = decoded.replace(0x00, ' ') + '\0';
        console.log(decoded);
        return cb(null, decoded);
      }
      else {
        return cb(null, result.content);
      }
    });*/
}

GithubHook.prototype.findReadmeFilesOfPreferredFormats = function (blobs, cb) {
  if (!blobs)
    return cb(null, null);

  function checkForFileExtension(ext, cb) {
    async.detect(
      blobs,
      function (blob, fcb) {
        fcb(blob.path.toLowerCase().indexOf(ext) !== -1);
      },
      function (result) {
        if (result)
          result = result.path; //sha;
        cb(null, result);
      });
  }

  var preferredFormats = [ '.md', '.markdown', '.html', '.txt' ];
  async.map(
    preferredFormats,
    function (fmt, mcp) {
      var fn = checkForFileExtension.bind(this, fmt);
      fn.fmt = fmt;
      mcp(null, fn);
    },
    function (err, mapped) {
      async.detectSeries(
        mapped,
        function (fn, dcb) {
          fn(function (err, readmeSHA) {
            fn.readmeSHA = readmeSHA;
            dcb(!err && readmeSHA);
          });
        },
        function (result) {
          if (result && result.readmeSHA)
            cb(null, result.readmeSHA);
          else
            cb(null, null);
        });
    });

}

GithubHook.prototype.findReadmeBlobsInTree = function (user, repo, treeSHA, cb) {
  var githubApi = new GitHubApi({ version: "3.0.0" });
  githubApi.gitdata.getTree(
    { user: user,
      repo: repo,
      sha: treeSHA },
    function (err, result) {
      if (err) return cb(err);

      async.filter(
        result.tree,
        function (tree, fcb) {
          fcb(tree.path.toUpperCase().indexOf('README') !== -1);
        },
        function (results) {
          if (results.length > 0)
            return cb(null, results);
          else
            return cb(null, null);
        });
    });
}

GithubHook.prototype.findMasterBranchSHA = function (user, repo, cb) {
  var githubApi = new GitHubApi({ version: "3.0.0" });
  githubApi.repos.getBranches(
    { user: user,
      repo: repo },
    function (err, result) {
      if (err) return cb(err);

      async.filter(
        result,
        function (branch, fcb) {
          return fcb(branch.name == 'master');
        },
        function (results) {
          if (results.length > 0) {
            return cb(null, results[0].commit.sha);
          }
        });
    });
}

GithubHook.prototype.getAllItems = function () {
  var self = this;

  var watched = self.config.get('watched');
  
  async.forEach(
    watched,
    function (item, forCb) {
      var githubApi = new GitHubApi({ version: "3.0.0" });

      if (item.subtype == 'repo') {
        githubApi.repos.get(
          { user: item.user,
            repo: item.repo },
          function (err, result) {
            self.findReadme(item.user, item.repo, function (err, readmeText) {
              result.readmeText = readmeText;
              self.emit('repo', result);
            });
          });

        return forCb();
      }
      return forCb();
    },
    function (err) {
      if (err) {
        throw new Error(err);
      }
    });
}

