<template>
  <div>
    <div v-if="processingVideo">
      Processing Video. Please wait...
    </div>
    <div v-else-if="allFrames !== null">
      <div class="selected-point">
        <span v-if="coordinatesInternal">
        Coordinates: {{ coordinatesInternal[0] }}, {{ coordinatesInternal[1] }}
        </span>
      </div>
      <div class="canvas" ref="parent">
        <canvas ref="canvas"
                @mousedown="handleCanvasMouseDown"
                @mousemove="handleCanvasMouseMove"
                @mouseup="handleCanvasMouseUp"
                @mousewheel="handleMouseWheel">
        </canvas>
      </div>

      <div class="controls">
        <div class="btn-group">
          <button class="btn btn-large btn-default" @click="selectVideo" title="Open">
            <span class="icon icon-folder"></span>
          </button>
          <button class="btn btn-large btn-default" @click="move(-1)" title="Previous frame">
            <span class="icon icon icon icon-fast-backward"></span>
          </button>
          <button class="btn btn-large btn-default" v-if="playing" @click="pause()">
            <span class="icon icon-pause"></span>
          </button>
          <button class="btn btn-large btn-default" v-else @click="play()">
            <span class="icon icon-play"></span>
          </button>
          <button class="btn btn-large btn-default" @click="move(1)" title="Next frame">
            <span class="icon icon icon icon-fast-forward"></span>
          </button>
        </div>

        <div class="slider">
          <vue-range-slider @input="positionChanged" tooltip="hover" :lazy="true" :min="1" ref="slider"
                            :value="currentFrameInternal" :max="allFrames.length">
          </vue-range-slider>
          ({{ currentFrameSrc | filename }}) {{ currentFrameInternal }} / {{ allFrames.length }}
        </div>
      </div>
    </div>
    <div v-else class="text-center">
      <h3>
        Select a video or directory containing frames for calibration
      </h3>
      <button class="btn btn-large btn-default" @click="selectVideo">Select Video or Directory</button>
    </div>

    <img ref="image" :src="currentFrameSrc" style="display: none" alt="" @load="imageLoaded"/>
  </div>
</template>

<style scoped>
.canvas {
  width: 100%;
  background: black;
  height: calc(60vh - 115px);
}

.canvas canvas {
  height: 100%;
  width: 100%;
}

.controls {
  display: flex;
  margin-top: 10px;
}

.controls .slider {
  flex-grow: 1;
  margin-left: 10px;
  text-align: right;
}

.selected-point {
  min-height: 20px;
  text-align: right;
}
</style>


<script>
import 'vue-range-component/dist/vue-range-slider.css';
import VueRangeSlider from 'vue-range-component';

// eslint-disable-next-line import/no-extraneous-dependencies
const { dialog } = require('electron').remote;
const extractFrames = require('ffmpeg-extract-frames');
const ffmpegPath = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ALLOWED_IMAGE_TYPES = [
  '.jpg',
  '.jpeg',
  '.tiff',
  '.png',
  '.gif',
];

const parseCoordinates = (s) => {
  s = s.split(',');
  return [parseInt(s[0], 10), parseInt(s[1], 10)];
};

export default {
  props: {
    coordinates: {},
    currentFrame: {},
    correspondences: {},
  },
  components: {
    VueRangeSlider,
  },
  data() {
    this.ctx = null;
    this.playHandler = false;

    this.scale = 1;
    this.transateX = 0;
    this.transateY = 0;
    this.userInteracted = false;

    this.canvasWidth = 0;
    this.canvasHeight = 0;

    this.videoHeight = null;
    this.videoWidth = null;

    this.dragStart = false;
    this.initialTraslate = null;

    return {
      processingVideo: false,
      allFrames: null,

      playing: false,
      currentFrameSrc: null,

      coordinatesInternal: null,
      currentFrameInternal: 0,
    };
  },
  mounted() {
    window.addEventListener('resize', this.calculateParameters, true);
    window.addEventListener('keyup', this.handleKeyUp, true);
    window.addEventListener('keydown', this.handleKeyDown, true);
    setInterval(() => {
      if (this.$refs.slider) {
        document.removeEventListener('keydown', this.$refs.slider.handleKeydown);
        document.removeEventListener('keyup', this.$refs.slider.handleKeyup);
      }
    }, 1000);
  },
  filters: {
    filename(f) {
      return path.basename(f);
    },
  },
  watch: {
    allFrames() {
      this.pause();
      this.currentFrameInternal = 0;

      this.ctx = null;
      this.videoHeight = null;
      this.videoWidth = null;
      this.userInteracted = false;
      this.scale = 1;

      this.$emit('clear');
      if (this.allFrames && this.allFrames.length > 0) {
        this.renderNextFrame();
      }
    },
    currentFrameInternal() {
      this.currentFrameSrc = `file://${this.allFrames[this.currentFrameInternal - 1]}`;

      if (this.currentFrame !== this.currentFrameInternal) {
        this.$emit('update:currentFrame', this.currentFrameInternal);
      }
    },
    coordinatesInternal() {
      const coordinates = this.coordinatesInternal
        ? `${this.coordinatesInternal[0]},${this.coordinatesInternal[1]}`
        : null;

      if (coordinates !== this.coordinates) {
        this.$emit('update:coordinates', coordinates);
      }
    },
    coordinates() {
      let { coordinates } = this;
      if (typeof coordinates === 'string') {
        coordinates = parseCoordinates(coordinates);
      }

      this.coordinatesInternal = coordinates;
      this.drawCurrentFrame();
    },
    currentFrame() {
      this.currentFrameInternal = this.currentFrame;
      this.coordinatesInternal = null;
    },
    correspondences() {
      this.drawCurrentFrame();
    },
  },
  methods: {
    selectVideo() {
      const results = dialog.showOpenDialogSync({
        properties: ['openFile', 'openDirectory'],
        filters: [
          { name: 'Video Files', extensions: ['mp4', 'mov', 'webm', 'ogg', 'avi', 'mkv', 'm4v'] },
        ],
      });
      if (results && results.length > 0) {
        this.processingVideo = true;
        this.allFrames = null;

        if (fs.statSync(results[0]).isDirectory()) {
          this.loadDirectory(results[0]);
        } else {
          this.extractVideoFrames(results[0]);
        }
      }
    },
    loadDirectory(directoryPath) {
      fs.readdir(directoryPath, (err, files) => {
        if (err) {
          alert(`Failed to read directory: ${err}`);
          this.processingVideo = false;
          return;
        }

        files = files.filter((file) => {
          const extension = path.extname(file).toLowerCase();
          return ALLOWED_IMAGE_TYPES.indexOf(extension) >= 0;
        }).map(file => path.join(directoryPath, file));

        if (files.length === 0) {
          alert('No supported image found in provided directory');
        } else {
          this.allFrames = files.sort((a, b) => a.localeCompare(
            b,
            navigator.languages[0] || navigator.language,
            { numeric: true, ignorePunctuation: true },
          ));
        }

        this.processingVideo = false;
      });
    },
    extractVideoFrames(videoPath) {
      fs.mkdtemp(path.join(os.tmpdir(), 'spatial-annotator-'), (err, folder) => {
        if (err) {
          alert(`Failed to create temporary directory: ${err}`);
          this.processingVideo = false;
          return;
        }

        extractFrames({
          input: videoPath,
          output: path.join(folder, 'frame_%d.jpg'),
          ffmpegPath,
        }).then(() => {
          this.loadDirectory(folder);
        }, () => {
          this.processingVideo = false;
          alert(`Failed to extract video frames: ${err}`);
        });
      });
    },
    play() {
      if (this.playing) {
        return;
      }

      if (this.currentFrameInternal > this.allFrames.length) {
        this.currentFrameInternal = 0;
      }

      this.playing = true;
      this.playHandler = setInterval(this.renderNextFrame, 100);
    },
    pause() {
      this.playing = false;
      clearInterval(this.playHandler);
    },
    calculateParameters() {
      if (typeof this.$refs.canvas !== 'undefined' && typeof this.$refs.parent !== 'undefined') {
        this.canvasWidth = this.$refs.parent.clientWidth;
        this.canvasHeight = Math.ceil((this.canvasWidth / this.videoWidth) * this.videoHeight);

        if (this.canvasHeight > this.$refs.parent.clientHeight) {
          this.canvasHeight = this.$refs.parent.clientHeight;
          this.canvasWidth = Math.ceil((this.canvasHeight / this.videoHeight) * this.videoWidth);
        }

        if (!this.userInteracted) {
          this.translateX = Math.abs(this.canvasWidth - this.$refs.parent.clientWidth) / 2;
          this.translateY = Math.abs(this.canvasHeight - this.$refs.parent.clientHeight) / 2;
        }

        this.$refs.canvas.width = this.$refs.parent.clientWidth;
        this.$refs.canvas.height = this.$refs.parent.clientHeight;

        this.drawCurrentFrame();
      } else {
        setTimeout(this.calculateParameters, 1000);
      }
    },
    handleCanvasMouseDown(e) {
      document.body.style.mozUserSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.userSelect = 'none';

      const x = e.offsetX || (e.pageX - this.$refs.canvas.offsetLeft);
      const y = e.offsetY || (e.pageY - this.$refs.canvas.offsetTop);
      this.initialTraslate = [this.translateX, this.translateY];
      this.dragStart = { x, y };
    },
    handleCanvasMouseMove(e) {
      if (!this.dragStart) {
        return;
      }

      const x = e.offsetX || (e.pageX - this.$refs.canvas.offsetLeft);
      const y = e.offsetY || (e.pageY - this.$refs.canvas.offsetTop);

      this.translateX += (x - this.dragStart.x) / this.scale;
      this.translateY += (y - this.dragStart.y) / this.scale;
      this.userInteracted = true;
      this.dragStart = { x, y };

      this.dragged = true;
      this.drawCurrentFrame();
    },
    handleCanvasMouseUp(e) {
      this.dragStart = null;
      if (this.initialTraslate
          && this.initialTraslate[0] === this.translateX
          && this.initialTraslate[1] === this.translateY) {
        this.selectPoint(e);
      }
    },
    handleMouseWheel(e) {
      // eslint-disable-next-line no-nested-ternary
      const delta = e.wheelDelta ? e.wheelDelta / 100 : e.detail ? -e.detail : 0;
      if (delta) {
        this.scale = Math.max(0.5, Math.min(4, this.scale + delta));
        this.drawCurrentFrame();
      }
    },
    renderNextFrame() {
      if (this.currentFrameInternal > this.allFrames.length) {
        this.pause();
        return;
      }

      this.currentFrameInternal += 1;
    },
    selectPoint(e) {
      const rect = this.$refs.canvas.getBoundingClientRect();
      const imageScale = this.videoWidth / this.canvasWidth;

      const x = Math.ceil((((e.clientX - rect.left) / this.scale) - this.translateX) * imageScale);
      const y = Math.ceil((((e.clientY - rect.top) / this.scale) - this.translateY) * imageScale);

      this.coordinatesInternal = [
        Math.max(0, Math.min(x, this.videoWidth)),
        Math.max(0, Math.min(y, this.videoHeight)),
      ];
    },
    positionChanged(value) {
      if (value === this.currentFrameInternal) {
        return;
      }

      this.pause();
      this.currentFrameInternal = value;
    },
    imageLoaded(e) {
      this.videoWidth = e.target.naturalWidth;
      this.videoHeight = e.target.naturalHeight;

      if (!this.ctx && this.$refs.canvas) {
        this.ctx = this.$refs.canvas.getContext('2d');
        this.calculateParameters();
      } else {
        this.drawCurrentFrame();
      }
    },
    drawCoordinates(c, color) {
      const imageScale = this.videoWidth / this.canvasWidth;
      const [x, y] = c;

      this.ctx.beginPath();
      this.ctx.fillStyle = color;
      this.ctx.arc(x / imageScale, y / imageScale, Math.round(4 / this.scale), 0, 2 * Math.PI);
      this.ctx.fill();
    },
    drawCurrentFrame() {
      if (this.ctx && this.$refs.image) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.$refs.canvas.width, this.$refs.canvas.height);
        this.ctx.scale(this.scale, this.scale);
        this.ctx.translate(this.translateX, this.translateY);

        this.ctx.drawImage(
          this.$refs.image, 0, 0,
          this.videoWidth, this.videoHeight,
          0, 0,
          this.canvasWidth, this.canvasHeight,
        );

        this.correspondences.filter(c => !c.editing && c.position === this.currentFrameInternal).forEach((c) => {
          c = parseCoordinates(c.imageCoordinates);
          this.drawCoordinates(c, '#00f');
        });

        if (this.coordinatesInternal) {
          this.drawCoordinates(this.coordinatesInternal, '#f00');
        }
      }
    },
    move(n) {
      this.pause();

      this.currentFrameInternal = Math.max(
        1,
        Math.min(this.currentFrameInternal + n, this.allFrames.length),
      );
    },
    handleKeyUp(e) {
      if (e.target.tagName === 'INPUT') {
        return;
      }

      if (e.key === ' ') {
        if (this.playing) {
          this.pause();
        } else if (this.allFrames !== null) {
          this.play();
        }
      }
    },
    handleKeyDown(e) {
      if (e.target.tagName === 'INPUT') {
        return;
      }

      let modified = 1;
      if (e.shiftKey) {
        modified = 10;
      }

      if (e.key === 'ArrowRight') {
        this.move(modified);
      } else if (e.key === 'ArrowLeft') {
        this.move(-1 * modified);
      }
    },
  },
};
</script>
