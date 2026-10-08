import fs from 'fs';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { Blob, FileReader } from 'v8'; // polyfill for GLTFExporter if needed, actually GLTFExporter might need Web APIs.

// Let's use pure node.js environment but GLTFExporter requires some DOM APIs.
// Maybe it's easier to just write an HTML file, run it in Playwright, and have Playwright save the downloaded file!
