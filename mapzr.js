var options = {
  zoom: 3,
  center: [28, -16]
};

if (window.localStorage) {
  let mapView = localStorage.getItem('mapView');
  if (mapView) {
    mapView = JSON.parse(mapView);
    options.center = mapView.center;
    options.zoom = mapView.zoom;
  }
}

if (location.hash) {
  let hashParams = {};
  location.hash.substring(1).split("&").forEach(s => {
    let def = s.split("=");
    hashParams[def[0]] = def[1];
  });
  try {
    options.geo = hashParams.geo;
    if (hashParams.c) {
      let center = hashParams.c.split(',').map(parseFloat);
      if (center.length == 2) {
        let zoom = parseFloat(hashParams.z || options.zoom);
        options.zoom = zoom;
        options.center = center;
      }
    }
  }
  catch (e) {
    // invalid hash params - do nothing
  }
}

var map = L.map('mainmap', {
    attributionControl: false,
    zoomSnap: 0.2,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 200, // zoom levels per "click": 40 = 1, 80 = 0.5 etc.  
    wheelDebounceTime: 200
});

map.setView(options.center, options.zoom);

var markerGroup = L.featureGroup().addTo(map);

// we need to create attribution control manually to suppress the "Leaflet" link
map.addControl(L.control.attribution({
    position: 'bottomright',
    prefix: ''
}));

var layerHiRes = L.tileLayer('https://osm.rrze.fau.de/osmhd/{z}/{x}/{y}.png', {
  //detectRetina: true,
  maxNativeZoom: 19,
  maxZoom: 20,
  //zoomOffset: 1,
  attribution: 'Map Data &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors, Tiles by <a href="https://osm.rrze.fau.de/">RRZE</a>'
}).addTo(map);

var layerControl = L.control.layers()
  .addBaseLayer(layerHiRes, "OSM Hi-Res")
  .addBaseLayer(L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    //detectRetina: true,
    maxNativeZoom: 19,
    maxZoom: 20,
    attribution: 'Map Data &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
  }), "OSM Default")
;
// this control is added further down to ensure correct event handling order for clicks

function roundCoords(latlng, multiplier) {

    lat = latlng.lat;
    lng = latlng.lng;
    
    multiplier = multiplier || 1;
        
    var xy = map.latLngToContainerPoint(latlng);
    var neighbourPoint = map.containerPointToLatLng([xy.x-1,xy.y-1]);
    
    var latResolution = Math.min(Math.abs(neighbourPoint.lat - lat), 1);
    var lngResolution = Math.min(Math.abs(neighbourPoint.lng - lng), 1);
    
    // calculate significant number of decimals
    var latSig = 1, lngSig = 1;       
    while (1 / latSig > latResolution) latSig *= 10;
    while (1 / lngSig > lngResolution) lngSig *= 10;
    //latSig = Math.max(latSig/10, 1);
    //lngSig = Math.max(lngSig/10, 1);
    
    latSig /= multiplier;
    lngSig /= multiplier;
        
    // truncate
    var latRounded = Math.round(lat * latSig) / latSig,
        lngRounded = Math.round(lng * lngSig) / lngSig;
        
    return L.latLng(latRounded, lngRounded);
}

var boundInverse = map.containerPointToLatLng.bind(map);
var lastCoords = null;
var geoJSON = {
  type: "FeatureCollection",
  features: []
}

function clearMap() {
  markerGroup.clearLayers();
}

function showGeoJSON(data) {
  data = data || geoJSON;
  clearMap();
  L.geoJSON(data, {
    pointToLayer: createMarker
  }).addTo(markerGroup);
  if (data.features.length > 0) {
    document.querySelector("#download").classList.remove("disabled");
  }
  else {
    document.querySelector("#download").classList.add("disabled");
  }
}

function createPopup() {
  let editForm = document.createElement("DIV");
  editForm.innerHTML = '<div class="tabs"><!--Info Edit Share-->&nbsp;</div><input type="text" class="field-title" size="20" placeholder="Title">' +
                '<textarea class="field-description" autocomplete="off" placeholder="Description" style="resize: none;"></textarea>' +
                '<small class="coords">Lat/Lon: <span class="latlng copycontent">0, 0</span></small>' +
                '<div><button class="ok">OK</button> <button class="cancel">Cancel</button></div>';
    
  let editPopup = L.popup({
    maxWidth: 230,
    maxHeight: 400,
    //closeButton: false,
    keepInView: true
  }).setContent(editForm);
  
  let draggable = null;

  let titleEl = editForm.getElementsByClassName("field-title")[0];
  let descriptionEl = editForm.getElementsByClassName("field-description")[0];
  let buttonOk = editForm.getElementsByClassName("ok")[0];
  let buttonCancel = editForm.getElementsByClassName("cancel")[0];
  let latlngEl = editForm.getElementsByClassName("latlng")[0];
  
  initCopyable(editForm.getElementsByClassName("coords")[0]);

  function focusTitle() {
    window.setTimeout(function() {
      titleEl.select();
    }, 30);
    
  }
  titleEl.addEventListener("focus", function() {
    focusTitle();
  })
  titleEl.addEventListener("keyup", function (e) {
    if (e.keyCode == 13) { // ENTER
        submit();
    }
    if (e.keyCode == 27) { // ESC
        cancel();
    }
  });
  
  function submit() {
    let latlng = editPopup.getLatLng();
    if (editMarker) {
      editMarker.geoJSON.properties.title = titleEl.value;
      editMarker.geoJSON.properties.description = descriptionEl.value;
      editMarker.geoJSON.geometry.coordinates = [latlng.lng, latlng.lat];
      showGeoJSON(geoJSON);
    }
    else {
      createPoint(latlng, {
        title: titleEl.value,
        description: descriptionEl.value
      });
    }
    map.closePopup(editPopup);
    endEdit();
  }

  function cancel() {
    map.closePopup(editPopup);
    endEdit();
  }

  buttonOk.addEventListener('click', submit);
  buttonCancel.addEventListener('click', cancel);
  
  editPopup.setMarker = function(marker) {
    endEdit();
    editMarker = marker;
    if (marker && marker.geoJSON) {
      marker.setOpacity(0);
      titleEl.value = marker.geoJSON.properties && marker.geoJSON.properties.title || "";
      descriptionEl.value = marker.geoJSON.properties && marker.geoJSON.properties.description || "";
      buttonOk.innerHTML = "Update Marker";
      buttonCancel.innerHTML = "Cancel";
    }
    else {
      titleEl.value = "";
      descriptionEl.value = "";
      buttonOk.innerHTML = "Create Marker";
      buttonCancel.innerHTML = "Discard";
    }
  }
  
  editPopup.show = function(latlng, marker) {
    editPopup.setLatLng(latlng);
    editPopup.setMarker(marker);
    latlngEl.innerHTML = latlng.lat + ", " + latlng.lng;
    map.openPopup(this);
        
    if (!draggable) {
      let grip = document.createElement("div");
      grip.className = "grip";
      editPopup._wrapper.appendChild(grip);
      
      draggable = new L.Draggable(editPopup._container, grip);
      draggable.enable();
      
      draggable.on('dragend', function() {
        var pos = roundCoords(map.layerPointToLatLng(this._newPos));
        latlngEl.innerHTML = pos.lat + ", " + pos.lng;
        editPopup.setLatLng(pos);
      });
      
      draggable.on('drag', function() {
        var pos = roundCoords(map.layerPointToLatLng(this._newPos));
        latlngEl.innerHTML = pos.lat + ", " + pos.lng;
      });

    }
    focusTitle();
  }
  
  function endEdit() {
    if (editMarker) {
      editMarker.setOpacity(1);
    }
    editMarker = null;
  }
  editPopup.addEventListener('popupclose', endEdit);
  editPopup.addEventListener('remove', endEdit);

  return editPopup;
}

let editMarker = null;
let editPopup = createPopup();

function createMarker(geoJSON, latlng) {
  let title = geoJSON.properties && geoJSON.properties.title || "";
  let icon = new L.DivIcon({
    iconSize: [25,30],
    iconAnchor: [13,29],
    html: '<svg width="25" height="30" viewBox="-1 -1 28 32"><path fill="#ffffff" stroke="#000000" stroke-width="2" stroke-miterlimit="10" d="M4.5,0.5c0,0,14.1,0,17,0s4,1,4,4s0,13.9,0,17s-1,4-4,4s-3,0-5,0c-3,0-3.5,3-3.5,3l0,0c0,0-0.5-3-3.5-3s-2,0-5,0s-4-1-4-4s0-13.9,0-17S1.5,0.5,4.5,0.5z"/></svg>' +
    '<div class="title"><span>' + title + '</span></div>'  // <div class="btn-remove">X</div>
  });
  icon.createIcon = function(oldIcon) {
    let div = L.DivIcon.prototype.createIcon.call(this, oldIcon);
    /*
    let removeButton = div.getElementsByClassName('btn-remove')[0];
    removeButton.addEventListener("click", function(ev) {
      removePoint(geoJSON);
      // prevent propagation of click event to map
      ev.cancelBubble = true;
    });
    */
    return div;
  }
  let marker = new L.marker(latlng, {
    draggable: true,
    icon: icon
  });
  marker.addEventListener('click', function(ev) {
    // prevent propagation of click event to map
    this.toggleEditor();
    ev.cancelBubble = true;
  });
  marker.addEventListener('moveend', function(ev) {
    let latlng = roundCoords(this.getLatLng());
    this.setLatLng(latlng);
    this.geoJSON.geometry.coordinates = [latlng.lng, latlng.lat];
  });
  marker.toggleEditor = function() {
    editPopup.show(this.getLatLng(), this);
  }
  marker.geoJSON = geoJSON;
  return marker;
}

map.on('mousemove', function(ev) {
    lastCoords = roundCoords(ev.latlng);   
    //document.getElementById("coords").textContent = lastCoords.lat + ", " + lastCoords.lng;
});

map.on('click', function(ev) {

  // check if layers control is expanded, if so collapse
  var ctrl = document.querySelector('.leaflet-control-layers-expanded');
  if (ctrl) {
    layerControl.collapse();
    return;
  }
  
  lastCoords = roundCoords(ev.latlng);   
  editPopup.show(lastCoords, null);   
});

// add control after click listener above, to ensure correct order of listeres
map.addControl(layerControl);

function copyToClipboard(text, fallback) {
  
  var textArea = document.createElement("textarea");
  textArea.value = text;
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  var successful = false;

  try {
      successful = document.execCommand('copy');
      if (!successful && fallback) {
          window.prompt("Coordinates:", text);
          successful = true;
      }
  } catch (err) {
      if (fallback) {
        window.prompt("Coordinates:", text);
        successful = true;
      }
  }   
  
  document.body.removeChild(textArea);
  
  return successful;
}

function initCopyable(element, options) {
  
  if (document.queryCommandSupported && document.queryCommandSupported('copy')) {
    
    options = Object.assign({
      copyableTitle: "Click to copy to clipboard",
      copiedTitle: "Copied to clipboard",
      errorTitle: "Error copying to clipboard"
    }, options);
    
    element.classList.add("copyable");
    element.title = options.copyableTitle;
    
    var content = element.querySelector(".copycontent") || element;
    
    element.addEventListener('click', function(event) {
      var successful = copyToClipboard(content.textContent);
      if (successful) {
        element.classList.add("copied");
        element.title = options.copiedTitle;
      }
      else {
        element.title = options.errorTitle;
      }
    });
    
            
    var observer = new MutationObserver(function() {
      element.classList.remove("copied");
      element.title = options.copyableTitle;
    });
    observer.observe(content, {characterData: true, childList: true})

  }
  
}

map.addEventListener('zoomend', function(ev) {
  storeCurrentMapState();
});
map.addEventListener('moveend', function(ev) {
  storeCurrentMapState();
});

function storeCurrentMapState() {
  if (window.localStorage) {
    let mapView = {
      center: roundCoords(map.getCenter()),
      zoom: map.getZoom()
    }
    localStorage.setItem('mapView', JSON.stringify(mapView));
  }
}

function createPoint(latlng, properties) {
  // convert various latlng formats
  latlng = L.latLng(latlng);
  markerJSON = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [latlng.lng, latlng.lat]
    },
    properties: properties || {
      title: "",
      description: "",
      icon: "icon"
    }
  }
  geoJSON.features.push(markerJSON);
  showGeoJSON(geoJSON);
}

function removePoint(markerJSON) {
  let idx = geoJSON.features.indexOf(markerJSON);
  if (idx > -1) {
    geoJSON.features.splice(idx, 1);
    showGeoJSON(geoJSON);
  }
}

function loadNominatimJSON(queryString, numResults, callback) {

    var protocol = window.location.protocol;
    
    // for file protocol
    if (!protocol.startsWith("http")) protocol = "http:";

    var url = protocol + '//nominatim.openstreetmap.org/search?format=json&limit=' + numResults + '&q=' + queryString;
    
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.onload = function () {   
        var data = JSON.parse(xhr.responseText);        
        callback(data);
    }

    xhr.send(null);       
}

function showModal(id) {
  
    // make sure only one modal is visible at any time
    document.querySelectorAll("#modals > section").forEach(function(el) {
      el.style.display = "none";
    });

    var wrapper = document.getElementById("modals");
    var el = document.getElementById(id);
    
    wrapper.style.display = "block";
    el.style.display = "block";
}

function hideOverlays() {
    var wrapper = document.getElementById("overlays");
    wrapper.style.display = "none";
}

document.getElementById("createURL").addEventListener("click", function(ev) {
  jsonStr = JSON.stringify(geoJSON,null,0);
  compressed = LZString.compressToEncodedURIComponent(jsonStr);
  //encoded = btoa(jsonStr);
  //alert(encoded.length + ":" + compressed.length + "\n\n" + compressed);
  let zoom = map.getZoom().toFixed(1);
  let center = roundCoords(map.getCenter(), 10);
  location.href = '#c=' + center.lat + ',' + center.lng + '&z=' + zoom + '&geo=' + compressed;
});

document.querySelectorAll(".show-siteInfo").forEach(function(el) {
  el.addEventListener("click", function(ev) {
    showModal("siteInfo");
  });
});

document.querySelector("#download").addEventListener("click", function(ev) {
  if (geoJSON && geoJSON.features.length > 0) {
    var dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geoJSON, null, 2));
    var link = document.createElement('a');
    link.setAttribute("href", dataStr);
    link.setAttribute("download", "mapzr-export.json");
    document.body.appendChild(link); 
    link.click();
    link.remove();
  }
});

window.addEventListener('load', function() {
  if (options.geo) {
    let geoStr = LZString.decompressFromEncodedURIComponent(options.geo);
    let geo = JSON.parse(geoStr);
    
    geoJSON = geo;
    showGeoJSON(geoJSON);
  }
});

document.getElementById("searchform").addEventListener("submit", function(ev) {
    
    ev.preventDefault();
    
    var inputEl = document.getElementById("searchinput");    
    var query = inputEl.value;
    inputEl.blur();
    
    document.getElementById("search-term").textContent = query;
    
    loadNominatimJSON(query, 8, function (data) {
    
        inputEl.value = "";
    
        var results = document.getElementById("searchresults-list");
        results.innerHTML = "";
        
        data.forEach(function(item) {
            var el = document.createElement("li");
            el.textContent = item.display_name;
            el.addEventListener("click", function() {
                var bounds = L.latLngBounds(L.latLng(
                    parseFloat(item.boundingbox[0]),
                    parseFloat(item.boundingbox[2])
                ),
                L.latLng(
                    parseFloat(item.boundingbox[1]),
                    parseFloat(item.boundingbox[3])
                ));
                map.fitBounds(bounds);
            });
            results.appendChild(el);
        });
        
        showModal("searchresults");
     });

});

function makeClosebutton(el, closeableClass) {
  closeableClass = closeableClass || "closeable";
  el.addEventListener("click", function(ev) {
    var el = this;
    // walk all the way up, close all closeables (needed for modals)
    while (el) {
      if (el.classList.contains(closeableClass)) {
        el.style.display = "none";
      }
      el = el.parentElement;
    }
  });
}

document.querySelectorAll(".closebutton").forEach(function(el){makeClosebutton(el)});

var jumpEl = document.getElementById("jumpcurrentlocation");
if (navigator.geolocation && (window.location.protocol == "https:" || window.location.protocol == "file:")) {
    jumpEl.classList.remove("disabled");
    jumpEl.addEventListener("click", function(ev){
        navigator.geolocation.getCurrentPosition(function(position) {
            map.setView([position.coords.latitude, position.coords.longitude], 17, {animate: true});
        },
        function(error){
            document.getElementById("coords").textContent = "Error acquiring GPS position!";
        },
        {
            enableHighAccuracy: true,
            timeout : 5000,
            maximumAge: 0
        });
    });
} else {
    jumpEl.classList.add("disabled");
}
