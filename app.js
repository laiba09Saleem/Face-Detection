document.addEventListener('DOMContentLoaded', async () => {
  // Load face-api.js models
  await loadModels();

  // DOM elements
  const inputType = document.getElementById('inputType');
  const imageUploadContainer = document.getElementById('imageUploadContainer');
  const videoControls = document.getElementById('videoControls');
  const startVideoBtn = document.getElementById('startVideo');
  const stopVideoBtn = document.getElementById('stopVideo');
  const imageUpload = document.getElementById('imageUpload');
  const inputImage = document.getElementById('inputImage');
  const inputVideo = document.getElementById('inputVideo');
  const overlay = document.getElementById('overlay');
  const detectionOptions = document.getElementById('detectionOptions');
  const minConfidence = document.getElementById('minConfidence');
  const confidenceValue = document.getElementById('confidenceValue');
  const resultsTable = document.getElementById('resultsTable');

  // Variables
  let stream = null;
  let detectionInterval = null;
  let options = {
    detectFace: true,
    detectLandmarks: true,
    detectExpressions: false,
    detectAgeGender: false,
    minConfidence: 0.5
  };

  // Event listeners
  inputType.addEventListener('change', handleInputTypeChange);
  startVideoBtn.addEventListener('click', startVideo);
  stopVideoBtn.addEventListener('click', stopVideo);
  imageUpload.addEventListener('change', handleImageUpload);
  detectionOptions.addEventListener('change', updateDetectionOptions);
  minConfidence.addEventListener('input', updateMinConfidence);

  // Initial setup
  handleInputTypeChange();

  // Functions
  async function loadModels() {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri('/models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
      await faceapi.nets.faceExpressionNet.loadFromUri('/models');
      await faceapi.nets.ageGenderNet.loadFromUri('/models');
      console.log('✅ All models loaded successfully!');
    } catch (error) {
      console.error('❌ Error loading models:', error);
      alert('Error loading face detection models. Please ensure:\n1. You have a "models" folder with all required files\n2. You are running on a local server (not file://)');
    }
  }

  function handleInputTypeChange() {
    const selectedType = inputType.value;

    if (selectedType === 'image') {
      imageUploadContainer.style.display = 'block';
      videoControls.style.display = 'none';
      inputImage.style.display = 'block';
      inputVideo.style.display = 'none';
      stopVideo();
    } else {
      imageUploadContainer.style.display = 'none';
      videoControls.style.display = 'block';
      inputImage.style.display = 'none';
      inputVideo.style.display = 'block';
    }
  }

  async function startVideo() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 1280,
          height: 720,
          facingMode: 'user'
        },
        audio: false
      });
      inputVideo.srcObject = stream;
      startVideoBtn.disabled = true;
      stopVideoBtn.disabled = false;

      detectionInterval = setInterval(async () => {
        await detectFaces(inputVideo);
      }, 300);
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Could not access the camera. Please ensure you have granted camera permissions.');
    }
  }

  function stopVideo() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
    if (detectionInterval) {
      clearInterval(detectionInterval);
      detectionInterval = null;
    }
    startVideoBtn.disabled = false;
    stopVideoBtn.disabled = true;

    const context = overlay.getContext('2d');
    context.clearRect(0, 0, overlay.width, overlay.height);
    resultsTable.innerHTML = '';
  }

  function handleImageUpload() {
    const file = imageUpload.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      inputImage.src = event.target.result;

      inputImage.onload = async () => {
        await detectFaces(inputImage);
      };
    };
    reader.readAsDataURL(file);
  }

  function updateDetectionOptions() {
    const selectedOptions = Array.from(detectionOptions.selectedOptions)
      .map(option => option.value);

    options.detectFace = selectedOptions.includes('face');
    options.detectLandmarks = selectedOptions.includes('landmarks');
    options.detectExpressions = selectedOptions.includes('expressions');
    options.detectAgeGender = selectedOptions.includes('ageGender');
  }

  function updateMinConfidence() {
    options.minConfidence = parseFloat(minConfidence.value);
    confidenceValue.textContent = options.minConfidence.toFixed(2);
  }

  async function detectFaces(input) {
    resultsTable.innerHTML = '';

    const displaySize = {
      width: input.width || input.videoWidth,
      height: input.height || input.videoHeight
    };

    // Set overlay size to match input size
    overlay.width = displaySize.width;
    overlay.height = displaySize.height;

    faceapi.matchDimensions(overlay, displaySize);

    let detections;
    try {
      if (options.detectFace && !options.detectLandmarks && !options.detectExpressions && !options.detectAgeGender) {
        detections = await faceapi.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({
          inputSize: 512,
          scoreThreshold: options.minConfidence
        }));
      } else {
        detections = await faceapi.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({
          inputSize: 512,
          scoreThreshold: options.minConfidence
        }))
          .withFaceLandmarks(true)
          .withFaceExpressions(options.detectExpressions)
          .withAgeAndGender(options.detectAgeGender);
      }
    } catch (error) {
      console.error('Detection error:', error);
      return;
    }

    console.log('Detections:', detections); // For debugging

    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    const context = overlay.getContext('2d');
    context.clearRect(0, 0, overlay.width, overlay.height);

    if (options.detectFace) {
      faceapi.draw.drawDetections(overlay, resizedDetections);
    }
    if (options.detectLandmarks) {
      faceapi.draw.drawFaceLandmarks(overlay, resizedDetections);
    }
    if (options.detectExpressions) {
      resizedDetections.forEach(detection => {
        if (detection.expressions) {
          const expression = Object.entries(detection.expressions)
            .reduce((a, b) => a[1] > b[1] ? a : b)[0];
          const box = detection.detection.box;
          new faceapi.draw.DrawTextField(
            [`${expression} (${Math.round(detection.expressions[expression] * 100)}%)`],
            { x: box.x, y: box.y + box.height }
          ).draw(overlay);
        }
      });
    }
    if (options.detectAgeGender) {
      resizedDetections.forEach(detection => {
        if (detection.age && detection.gender) {
          const box = detection.detection.box;
          new faceapi.draw.DrawTextField(
            [`${Math.round(detection.age)} years`, `${detection.gender}`],
            { x: box.x, y: box.y - 50 }
          ).draw(overlay);
        }
      });
    }

    displayResults(resizedDetections);
  }

  function displayResults(detections) {
    if (detections.length === 0) {
      resultsTable.innerHTML = '<p>No faces detected.</p>';
      return;
    }

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
          <tr>
              <th>Face #</th>
              ${options.detectFace ? '<th>Confidence</th>' : ''}
              ${options.detectAgeGender ? '<th>Gender</th><th>Age</th>' : ''}
              ${options.detectExpressions ? '<th>Dominant Expression</th>' : ''}
          </tr>
      </thead>
      <tbody>
          ${detections.map((detection, i) => `
              <tr>
                  <td>${i + 1}</td>
                  ${options.detectFace ? `<td>${(detection.detection.score * 100).toFixed(2)}%</td>` : ''}
                  ${options.detectAgeGender ? `
                      <td>${detection.gender || 'N/A'}</td>
                      <td>${detection.age ? Math.round(detection.age) : 'N/A'}</td>
                  ` : ''}
                  ${options.detectExpressions ? `
                      <td>
                          ${detection.expressions ?
                            Object.entries(detection.expressions)
                              .reduce((a, b) => a[1] > b[1] ? a : b)[0] +
                            ` (${Math.round(Object.entries(detection.expressions)
                              .reduce((a, b) => a[1] > b[1] ? a : b)[1] * 100)}%)` :
                            'N/A'}
                      </td>
                  ` : ''}
              </tr>
          `).join('')}
      </tbody>
    `;

    resultsTable.appendChild(table);
  }
});