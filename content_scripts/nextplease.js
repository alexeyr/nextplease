(function() {
  /**
   * Check and set a global guard variable.
   * If this content script is injected into the same page again,
   * it will do nothing next time.
   */
  if (window.hasRun) {
    return;
  }
  window.hasRun = true;

 /**
   * Listen for messages from the popup script.
   */
  browser.runtime.onMessage.addListener((message) => {
    nextplease.openDirection(message.command);
  });

  var nextplease = {};

  nextplease.openDirection = function(direction) {
      alert(direction);
  };
})();
