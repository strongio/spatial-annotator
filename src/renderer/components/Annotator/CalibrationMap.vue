<template>
  <div class="root" ref="root">
    <input name="search" class="form-control" placeholder="Search place...">
    <div class="mapbox"></div>
  </div>
</template>

<script>
const parseCoordinates = (s) => {
  s = s.split(',');
  return { lat: parseFloat(s[0]), lng: parseFloat(s[1]) };
};

export default {
  props: {
    coordinates: String,
    currentFrame: Number,
    correspondences: {},
  },
  mounted() {
    this.delayedInit();
  },
  data() {
    this.map = null;
    this.markers = [];
    this.hasUserMarker = false;
    this.markerImager = null;
    return {};
  },
  watch: {
    coordinates() {
      if (this.coordinates === null) {
        this.clearUserMarker();
      } else {
        this.addSelectionMarker(parseCoordinates(this.coordinates));
      }

      this.redrawMarkers();
    },
    currentFrame() {
      this.hasUserMarker = false;
      this.redrawMarkers();
    },
  },
  methods: {
    delayedInit() {
      if (typeof window.google === 'undefined') {
        setTimeout(this.delayedInit, 1000);
      } else {
        this.init();
      }
    },
    init() {
      const initialPoint = { lat: 34.14075279730816, lng: -118.04446710323901 };

      this.map = new window.google.maps.Map(this.$refs.root.querySelector('.mapbox'), {
        zoom: 17,
        center: initialPoint,
        mapTypeId: 'satellite',
        heading: 90,
        tilt: 45,
      });

      this.markerImage = new window.google.maps.MarkerImage(
        'https://img.icons8.com/fluent/48/000000/marker-storm.png',
        null, /* size is determined at runtime */
        null, /* origin is 0,0 */
        null, /* anchor is bottom center of the scaled image */
        new window.google.maps.Size(24, 24),
      );

      const input = this.$refs.root.querySelector('input[name=search]');
      const searchBox = new window.google.maps.places.SearchBox(input);

      // Bias the SearchBox results towards current map's viewport.
      this.map.addListener('bounds_changed', () => {
        searchBox.setBounds(this.map.getBounds());
      });

      this.map.addListener('click', (e) => {
        this.addSelectionMarker(e.latLng);
      });

      searchBox.addListener('places_changed', () => {
        const places = searchBox.getPlaces().filter(p => p.geometry);

        if (places.length === 0) {
          return;
        }

        this.addSelectionMarker(places[0].geometry.location);
        this.map.setCenter(places[0].geometry.location);
      });
    },
    clearMarker() {
      let selectionMarker = null;
      if (this.hasUserMarker) {
        // eslint-disable-next-line prefer-destructuring
        selectionMarker = this.markers[0];

        this.markers.slice(1).forEach((marker) => {
          marker.setMap(null);
        });
      } else {
        this.markers.forEach((marker) => {
          marker.setMap(null);
        });
      }

      this.markers = [];
      if (selectionMarker !== null) {
        this.markers.push(selectionMarker);
      }
    },
    clearUserMarker() {
      if (this.hasUserMarker) {
        this.hasUserMarker = false;
        this.markers[0].setMap(null);
        this.markers.splice(0, 1);
      }
    },
    addSelectionMarker(position) {
      this.clearUserMarker();

      this.markers.unshift(new window.google.maps.Marker({
        map: this.map,
        position,
      }));
      this.hasUserMarker = true;

      if (typeof position.toJSON !== 'undefined') {
        position = position.toJSON();
      }

      this.$emit('update:coordinates', `${position.lat},${position.lng}`);
    },
    redrawMarkers() {
      this.clearMarker();

      this.correspondences.filter(c => !c.editing && c.position === this.currentFrame).forEach((c) => {
        this.markers.push(new window.google.maps.Marker({
          map: this.map,
          position: parseCoordinates(c.gpsCoordinates),
          icon: this.markerImage,
        }));
      });
    },
  },
};
</script>

<style scoped>
.root {
  position: relative;
}

input[name=search] {
  margin-bottom: 8px;
}

.mapbox {
  height: calc(60vh - 125px);
  width: 100%;
}
</style>
