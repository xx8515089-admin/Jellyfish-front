(function () {
  var params = new URLSearchParams(window.location.search)
  var workspaceId = params.get('workspace')
  if (!workspaceId) return

  var prefix = 'jellyfish_canvas:' + encodeURIComponent(workspaceId) + ':'
  var nativeGetItem = Storage.prototype.getItem
  var nativeSetItem = Storage.prototype.setItem
  var nativeRemoveItem = Storage.prototype.removeItem
  var nativeClear = Storage.prototype.clear
  var nativeKey = Storage.prototype.key
  var lengthDescriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'length')
  var notifyTimer = 0

  function isScopedStorage(storage) {
    return storage === window.localStorage
  }

  function scopedKeys() {
    var keys = []
    var length = lengthDescriptor && lengthDescriptor.get
      ? lengthDescriptor.get.call(window.localStorage)
      : 0
    for (var index = 0; index < length; index += 1) {
      var key = nativeKey.call(window.localStorage, index)
      if (key && key.indexOf(prefix) === 0) keys.push(key)
    }
    return keys
  }

  function notifyChanged() {
    window.clearTimeout(notifyTimer)
    notifyTimer = window.setTimeout(function () {
      window.parent.postMessage({
        source: 'jellyfish-canvas',
        type: 'changed',
        workspaceId: workspaceId,
      }, window.location.origin)
    }, 250)
  }

  Storage.prototype.getItem = function (key) {
    return nativeGetItem.call(this, isScopedStorage(this) ? prefix + key : key)
  }

  Storage.prototype.setItem = function (key, value) {
    nativeSetItem.call(this, isScopedStorage(this) ? prefix + key : key, value)
    if (isScopedStorage(this)) notifyChanged()
  }

  Storage.prototype.removeItem = function (key) {
    nativeRemoveItem.call(this, isScopedStorage(this) ? prefix + key : key)
    if (isScopedStorage(this)) notifyChanged()
  }

  Storage.prototype.clear = function () {
    if (!isScopedStorage(this)) {
      nativeClear.call(this)
      return
    }
    scopedKeys().forEach(function (key) {
      nativeRemoveItem.call(window.localStorage, key)
    })
    notifyChanged()
  }

  Storage.prototype.key = function (index) {
    if (!isScopedStorage(this)) return nativeKey.call(this, index)
    var key = scopedKeys()[index]
    return key ? key.slice(prefix.length) : null
  }

  if (lengthDescriptor && lengthDescriptor.get) {
    try {
      Object.defineProperty(Storage.prototype, 'length', {
        configurable: true,
        enumerable: lengthDescriptor.enumerable,
        get: function () {
          return isScopedStorage(this)
            ? scopedKeys().length
            : lengthDescriptor.get.call(this)
        },
      })
    } catch (_) {
      // Older browsers may not allow redefining this getter; key access remains scoped.
    }
  }

  if (window.indexedDB) {
    var nativeOpen = IDBFactory.prototype.open
    var nativeDeleteDatabase = IDBFactory.prototype.deleteDatabase
    IDBFactory.prototype.open = function (name, version) {
      var scopedName = prefix + name
      return version === undefined
        ? nativeOpen.call(this, scopedName)
        : nativeOpen.call(this, scopedName, version)
    }
    IDBFactory.prototype.deleteDatabase = function (name) {
      return nativeDeleteDatabase.call(this, prefix + name)
    }
  }

  window.addEventListener('DOMContentLoaded', function () {
    document.documentElement.dataset.workspaceId = workspaceId
    window.parent.postMessage({
      source: 'jellyfish-canvas',
      type: 'ready',
      workspaceId: workspaceId,
    }, window.location.origin)
  })
})()
