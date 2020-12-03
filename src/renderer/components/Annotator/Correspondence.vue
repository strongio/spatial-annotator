<template>
  <div>
    <table class="table-striped">
      <thead>
      <tr>
        <th style="width: 25%">Frame</th>
        <th style="width: 30%">Image Coordinate</th>
        <th style="width: 30%">GPS Coordinate</th>
        <th style="width: 15%"></th>
      </tr>
      </thead>
    </table>
    <div class="correspondences">
      <table class="table-striped" style="margin-top: -5px">
        <thead style="opacity: 0;">
        <tr>
          <th style="width: 25%"></th>
          <th style="width: 30%"></th>
          <th style="width: 30%"></th>
          <th style="width: 15%"></th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(c, i) in correspondences" :key="c.index" :class="{ active: selectedInternal && c.index === selectedInternal.index }">
          <td>{{ c.position }}</td>
          <td>{{ c.imageCoordinates }}</td>
          <td>{{ c.gpsCoordinates }}</td>
          <td>
            <button class="btn btn-default" @click="deleteCorrespondence(i)">
              <span class="icon icon-trash"></span>
            </button>
            <button class="btn btn-default" @click="editCorrespondence(i)">
              <span class="icon icon-pencil"></span>
            </button>
          </td>
        </tr>
        </tbody>
      </table>
    </div>
    <div class="text-right py-20 px-10">
      <span v-if="writing" style="margin-right: 10px;">
        Exporting to file...
      </span>
      <span v-if="reading" style="margin-right: 10px;">
        Reading from file...
      </span>
      <button class="btn btn-large btn-default" :disabled="reading" @click="loadFile">
        Load from File
      </button>
      <button class="btn btn-large btn-primary" :disabled="writing || correspondences.length === 0"
              @click="exportToFile">
        Export to File
      </button>
    </div>
  </div>
</template>

<script>
// eslint-disable-next-line import/no-extraneous-dependencies
const { dialog } = require('electron').remote;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const fs = require('fs');

export default {
  props: {
    correspondences: Array,
    selected: {},
  },
  data() {
    return {
      writing: false,
      reading: false,
      selectedInternal: null,
    };
  },
  watch: {
    selectedInternal(newValue, oldValue) {
      if (oldValue) {
        delete oldValue.editing;
      }

      if (newValue) {
        newValue.editing = true;
      }

      if (this.selected !== this.selectedInternal) {
        this.$emit('update:selected', this.selectedInternal);
      }
    },
    selected() {
      this.selectedInternal = this.selected;
    },
  },
  methods: {
    deleteCorrespondence(index) {
      const correspondences = [...this.correspondences];
      correspondences.splice(index, 1);
      this.$emit('update:correspondences', correspondences);
    },
    editCorrespondence(index) {
      this.selectedInternal = this.correspondences[index];
      this.selectedInternal.editing = true;
    },
    loadFile() {
      const results = dialog.showOpenDialogSync({
        properties: ['openFile'],
        filters: [
          { name: 'Comma Separated Values (.csv)', extensions: ['csv'] },
        ],
      });
      if (!results || results.length === 0) {
        return;
      }

      this.reading = true;
      const correspondences = [];
      fs.createReadStream(results[0])
        .pipe(csv())
        .on('data', (row) => {
          correspondences.push({
            index: correspondences.length,
            position: parseInt(row.Position, 10),
            imageCoordinates: row['Image Coordinates'],
            gpsCoordinates: row['GPS Coordinates'],
          });
        })
        .on('end', () => {
          this.reading = false;
          this.$emit('update:correspondences', correspondences);
        });
    },
    exportToFile() {
      const outputPath = dialog.showSaveDialogSync({
        properties: ['createDirectory'],
        filters: [
          { name: 'Comma Separated Values (.csv)', extensions: ['csv'] },
        ],
      });

      if (!outputPath) {
        return;
      }

      this.writing = true;
      const csvWriter = createCsvWriter({
        path: outputPath,
        header: [
          { id: 'position', title: 'Position' },
          { id: 'imageCoordinates', title: 'Image Coordinates' },
          { id: 'gpsCoordinates', title: 'GPS Coordinates' },
        ],
      });

      csvWriter.writeRecords(this.correspondences)
        .then(() => {
          this.writing = false;
        });
    },
  },
};
</script>
