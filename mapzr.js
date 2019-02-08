var map = L.map('mainmap', {
    attributionControl: false
})
.setView([28, -16], 3);

var markerGroup = L.featureGroup().addTo(map);

// we need to create attribution control manually to suppress the "Leaflet" link
map.addControl(L.control.attribution({
    position: 'bottomright',
    prefix: ''
}));
      
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

function getSignificantCoordinates(xy, latlng, inverseProjection) {

    lat = latlng.lat;
    lng = latlng.lng;
        
    var neighbourPoint = inverseProjection([xy.x-1,xy.y-1]);
    
    var latResolution = Math.min(Math.abs(neighbourPoint.lat - lat), 1);
    var lngResolution = Math.min(Math.abs(neighbourPoint.lng - lng), 1);
    
    // calculate significant number of decimals
    var latSig = 1, lngSig = 1;       
    while (1 / latSig > latResolution) latSig *= 10;
    while (1 / lngSig > lngResolution) lngSig *= 10;
    //latSig = Math.max(latSig/10, 1);
    //lngSig = Math.max(lngSig/10, 1);
        
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

function showGeoJSON(geoJSON) {
  clearMap();
  L.geoJSON(geoJSON, {
    pointToLayer: function (feature, latlng) {
      let title = feature.properties && feature.properties.title || "";
      let icon = new L.DivIcon({
        iconSize: [25,30],
        iconAnchor: [12,30],
        html: '<svg width="25" height="30" viewBox="-1 -1 28 32"><path fill="#ffffff" stroke="#000000" stroke-width="2" stroke-miterlimit="10" d="M4.5,0.5c0,0,14.1,0,17,0s4,1,4,4s0,13.9,0,17s-1,4-4,4s-3,0-5,0c-3,0-3.5,3-3.5,3l0,0c0,0-0.5-3-3.5-3s-2,0-5,0s-4-1-4-4s0-13.9,0-17S1.5,0.5,4.5,0.5z"/></svg>' +
        '<div class="title"><span>' + title + '</span></div><div class="btn-remove">X</div>'
      });
      icon.createIcon = function(oldIcon) {
        let div = L.DivIcon.prototype.createIcon.call(this, oldIcon);
        let removeButton = div.getElementsByClassName('btn-remove')[0];
        removeButton.addEventListener("click", function(ev) {
          removeMarker(feature);
          // prevent propagation of click event to map
          ev.cancelBubble = true;
        });
        return div;
      }
      let marker = new L.marker(latlng, {
        draggable: true,
        icon: icon
      });
      marker.addEventListener('click', function(ev) {
        // prevent propagation of click event to map
        ev.cancelBubble = true;
      });
      marker.addEventListener('moveend', function(ev) {
        let latlng =  this.getLatLng();
        this.geoJSON.geometry.coordinates = [latlng.lng, latlng.lat];
      });
      marker.geoJSON = feature;
      return marker;
    }
  }).addTo(markerGroup);
}

map.addEventListener('mousemove', function(ev) {
    lastCoords = getSignificantCoordinates(ev.containerPoint, ev.latlng, boundInverse);   
    document.getElementById("coords").textContent = lastCoords.lat + ", " + lastCoords.lng;
});

map.addEventListener('click', function(ev) {
    if (lastCoords) {
        var text = lastCoords.lat + ", " + lastCoords.lng;
        
        var input = document.getElementById('copytextinput');
        input.style.display = "inline";
        input.value = text;
        input.select();
        
        createMarker(lastCoords);

        try {
            var successful = document.execCommand('copy');
            if (!successful) {
                window.prompt("Coordinates:", text);
            }
        } catch (err) {
            window.prompt("Coordinates:", text);
        }        
        input.style.display = "none";
    }
});

function createMarker(latlng, properties) {
  // convert various latlng formats
  latlng = L.latLng(latlng);
  markerJSON = {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [latlng.lng, latlng.lat]
    },
    properties: {
      title: "Title Title",
      description: "Description",
      icon: "icon"
    }
  }
  geoJSON.features.push(markerJSON);
  showGeoJSON(geoJSON);
}

function removeMarker(markerJSON) {
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

function showOverlay(id) {

    var wrapper = document.getElementById("overlays");
    var el = document.getElementById("searchresults");
    
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
  location.href = "#geo=" + compressed;
});

window.addEventListener('load', function() {
  if (location.hash) {
    
    var params = {}
    location.hash.substring(1).split("&").forEach(s => {
      let def = s.split("=");
      params[def[0]] = def[1];
    });
        
    if (params.geo) {
      let geoStr = LZString.decompressFromEncodedURIComponent(params.geo);
      let geo = JSON.parse(geoStr);
      
      geoJSON = geo;
      showGeoJSON(geoJSON);
    }
  }
});

/*
function showGeoJSON(obj) {
  if (obj.type) {
    if (obj.type == "Feature") {
      if (obj.geometry && obj.geometry.type) {
        if (obj.geometry.type == "Point") {
          let coords = obj.geometry.coordinates;
          if (coords && coords.length) {
            createMarker([coords[1], coords[0]], obj.properties);
          }
        }
        else {
          console.error("Unsupported geometry type: " + geometry.type);
        }
      }
      else {
        console.error("No geometry for feature");
      }
    }
    else if (obj.type == "FeatureCollection" && obj.features && obj.features.length) {
      obj.features.forEach(showGeoJSON);
    }
  }
  else {
    console.error("Invalid GeoJSON");
  }
}
  */  

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
        
        showOverlay("searchresults");
     });

});

function makeClosebutton(el, closeableClass) {
    closeableClass = closeableClass || "closeable";
    el.addEventListener("click", function(ev) {
        var el = this;
        while (el && !el.classList.contains(closeableClass)) {
            el = el.parentElement;
        }
        if (el) el.style.display = "none";
    });
}

document.querySelectorAll(".closebutton").forEach(makeClosebutton);

var jumpEl = document.getElementById("jumpcurrentlocation");
if (navigator.geolocation && (window.location.protocol == "https:" || window.location.protocol == "file:")) {
    jumpEl.classList.remove("disabled");
    jumpEl.addEventListener("click", function(ev){
        navigator.geolocation.getCurrentPosition(function(position) {
            map.setView([position.coords.latitude, position.coords.longitude], 13, {animate: true});
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
