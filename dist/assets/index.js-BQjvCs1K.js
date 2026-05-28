(function(){window.addEventListener("message",a=>{a.source===window&&(!a.data||a.data.type!=="MYT_TIMELINE_EVENT"||chrome.runtime.sendMessage({type:"MYT_TIMELINE_EVENT",payload:a.data.payload}))});
})()
