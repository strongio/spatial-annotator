<template>
  <div class="window-content">
    <div class="h-40 bottom-pane">
      <Correspondence :selected.sync="selectedCorrespondence" :correspondences.sync="correspondences" />
    </div>
    <div class="pane-group h-60">
      <div class="pane p-20">
        <video-picker :currentFrame.sync="currentFrame" :coordinates.sync="imageCoordinates"
                      :correspondences="correspondences" @clear="clearEverything" />
      </div>
      <div class="pane p-20">
        <calibration-map :currentFrame.sync="currentFrame" :coordinates.sync="gpsCoordinates"
                         :correspondences="correspondences" />
        <div class="text-right py-20 px-10">
          <button class="btn btn-large btn-default" @click="clear">Clear</button>
          <button class="btn btn-large btn-primary" @click="saveCorrespondence">Save Correspondence</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import CalibrationMap from './Annotator/CalibrationMap';
import Correspondence from './Annotator/Correspondence';
import VideoPicker from './Annotator/VideoPicker';

export default {
  components: {
    CalibrationMap,
    Correspondence,
    VideoPicker,
  },
  data() {
    this.pendingSelectionUpdate = false;

    return {
      currentFrame: 0,
      imageCoordinates: null,
      gpsCoordinates: null,

      correspondences: [],
      selectedCorrespondence: null,
    };
  },
  watch: {
    selectedCorrespondence() {
      if (this.selectedCorrespondence) {
        if (this.currentFrame === this.selectedCorrespondence.position) {
          this.imageCoordinates = this.selectedCorrespondence.imageCoordinates;
          this.gpsCoordinates = this.selectedCorrespondence.gpsCoordinates;
        } else {
          this.pendingSelectionUpdate = true;
          this.currentFrame = this.selectedCorrespondence.position;
        }
      }
    },
    currentFrame() {
      if (this.pendingSelectionUpdate) {
        this.pendingSelectionUpdate = false;

        setTimeout(() => {
          this.imageCoordinates = this.selectedCorrespondence.imageCoordinates;
          this.gpsCoordinates = this.selectedCorrespondence.gpsCoordinates;
        }, 500);
      } else {
        this.selectedCorrespondence = null;
      }
    },
  },
  methods: {
    saveCorrespondence() {
      if (!this.imageCoordinates) {
        alert('Please select coordinates on image');
        return;
      }

      if (!this.gpsCoordinates) {
        alert('Please select coordinates on map');
        return;
      }

      if (this.selectedCorrespondence) {
        this.selectedCorrespondence.imageCoordinates = this.imageCoordinates;
        this.selectedCorrespondence.gpsCoordinates = this.gpsCoordinates;
        this.selectedCorrespondence = null;
      } else {
        this.correspondences.unshift({
          index: this.correspondences.length,
          position: this.currentFrame,
          imageCoordinates: this.imageCoordinates,
          gpsCoordinates: this.gpsCoordinates,
        });
      }

      this.imageCoordinates = null;
      this.gpsCoordinates = null;
    },
    clear() {
      this.imageCoordinates = null;
      this.gpsCoordinates = null;
    },
    clearEverything() {
      this.clear();
      this.correspondences = [];
    },
  },
};
</script>

<style>
  .h-40 {
    height: 40vh;
  }

  .h-60 {
    height: 60vh;
  }

  .p-20 {
    padding: 20px;
  }

  .py-20 {
    padding-left: 20px;
    padding-right: 20px;
  }

  .px-10 {
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .bottom-pane {
    width: 100%;
    position: absolute;
    top: 60vh;
  }

  .correspondences {
    height: calc(40vh - 80px);
    overflow-y: auto;
  }

  .correspondences tr.active {
    color: #fff;
    background-color: #116cd6;
  }

  h3 {
    white-space: break-spaces;
  }
</style>
