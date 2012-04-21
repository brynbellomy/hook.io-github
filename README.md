# hook.io-github

Must be concise for now -- check the `config.json` for an example of how to
configure the hook to watch Github repositories.  No username/password
authorization needed for `hook.io-github` to communicate with the Github API.
Easy as pie.

__`hook.io-github` currently implements v3 of the API.__

To get a hook up and running in a hurry:

```javascript
var GithubHook = require('./hook.io-github').GithubHook;

var hook = new GithubHook({
  configFilePath: 'path/to/your/config.json',
  name: 'github',
  type: 'github',
  debug: true
});

hook.start();
```

`hook.io-github` will immediately start emitting `repo` events, each of which
contain the full Github API payload for a single one of the repos in your
`config.json`.

If you want to force `hook.io-github` to emit these events again at any point,
simply emit the event `getAllItems` (or `*::getAllItems`) from another one of your `hook.io` hooks:

```javascript
myHook.on('github::repo', function(someRepo) {
  ...
});

myHook.emit('getAllItems');
```

More documentation (and features) soon!

