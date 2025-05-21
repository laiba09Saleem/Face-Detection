document.addEventListener('DOMContentLoaded', async () => {
  await loadModels();

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

  let stream = null;
  let detectionInterval = null;

  let selectedOption = 'face';
  let minConf = 0.5;

  inputType.addEventListener('change', handleInputTypeChange);
  startVideoBtn.addEventListener('click', startVideo);
  stopVideoBtn.addEventListener('click', stopVideo);
  imageUpload.addEventListener('change', handleImageUpload);
  detectionOptions.addEventListener('change', updateDetectionOption);
  minConfidence.addEventListener('input', updateMinConfidence);

  handleInputTypeChange();
  updateMinConfidence();

  async function loadModels() {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri('models');
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri('models');
      await faceapi.nets.faceRecognitionNet.loadFromUri('models');
      await faceapi.nets.faceExpressionNet.loadFromUri('models');
      await faceapi.nets.ageGenderNet.loadFromUri('models');
      console.log('✅ All models loaded successfully!');
    } catch (error) {
      console.error('❌ Error loading models:', error);
      alert('Error loading face detection models. Please ensure:\n1. You have a "models" folder with all required files\n2. You are running on a live server or GitHub Pages.');
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

  function updateDetectionOption() {
    selectedOption = detectionOptions.value;
  }

  function updateMinConfidence() {
    minConf = parseFloat(minConfidence.value);
    confidenceValue.textContent = minConf.toFixed(2);
  }

  async function detectFaces(input) {
    resultsTable.innerHTML = '';

    const displaySize = {
      width: input.width || input.videoWidth,
      height: input.height || input.videoHeight
    };

    overlay.width = displaySize.width;
    overlay.height = displaySize.height;
    faceapi.matchDimensions(overlay, displaySize);

    let detections;

    try {
      const tinyFaceOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 512,
        scoreThreshold: minConf
      });

      if (selectedOption === 'face') {
        detections = await faceapi.detectAllFaces(input, tinyFaceOptions);
      } else {
        detections = await faceapi.detectAllFaces(input, tinyFaceOptions);

        if (selectedOption === 'landmarks') {
          detections = await faceapi.detectAllFaces(input, tinyFaceOptions).withFaceLandmarks(true);
        } else if (selectedOption === 'expressions') {
          detections = await faceapi.detectAllFaces(input, tinyFaceOptions).withFaceExpressions();
        } else if (selectedOption === 'ageGender') {
          detections = await faceapi.detectAllFaces(input, tinyFaceOptions).withAgeAndGender();
        }
      }
    } catch (error) {
      console.error('Detection error:', error);
      resultsTable.innerHTML = '<p>Error during detection. See console for details.</p>';
      return;
    }

    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    const context = overlay.getContext('2d');
    context.clearRect(0, 0, overlay.width, overlay.height);

    if (selectedOption === 'face') {
      faceapi.draw.drawDetections(overlay, resizedDetections);
    } else if (selectedOption === 'landmarks') {
      faceapi.draw.drawFaceLandmarks(overlay, resizedDetections);
    } else if (selectedOption === 'expressions') {
      faceapi.draw.drawDetections(overlay, resizedDetections);
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
    } else if (selectedOption === 'ageGender') {
      faceapi.draw.drawDetections(overlay, resizedDetections);
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
    if (!detections.length) {
      resultsTable.innerHTML = '<p>No faces detected.</p>';
      return;
    }

    let tableHTML = `
      <table border="1" cellpadding="6" cellspacing="0">
        <thead><tr><th>#</th>`;

    if (selectedOption === 'face') {
      tableHTML += `<th>Confidence</th>`;
    } else if (selectedOption === 'ageGender') {
      tableHTML += `<th>Gender</th><th>Age</th>`;
    } else if (selectedOption === 'expressions') {
      tableHTML += `<th>Dominant Expression</th>`;
    } else if (selectedOption === 'landmarks') {
      tableHTML += `<th>Landmarks (first 3 points)</th>`;
    }

    tableHTML += `</tr></thead><tbody>`;

    detections.forEach((d, i) => {
      tableHTML += `<tr><td>${i + 1}</td>`;

      if (selectedOption === 'face') {
        const score = d?.detection?.score ? `${(d.detection.score * 100).toFixed(2)}%` : 'N/A';
        tableHTML += `<td>${score}</td>`;
      } else if (selectedOption === 'ageGender') {
        const gender = d?.gender ?? 'N/A';
        const age = d?.age ? Math.round(d.age) : 'N/A';
        tableHTML += `<td>${gender}</td><td>${age}</td>`;
      } else if (selectedOption === 'expressions') {
        if (d.expressions) {
          const topExpr = Object.entries(d.expressions).reduce((a, b) => a[1] > b[1] ? a : b);
          tableHTML += `<td>${topExpr[0]} (${(topExpr[1] * 100).toFixed(2)}%)</td>`;
        } else {
          tableHTML += `<td>N/A</td>`;
        }
      } else if (selectedOption === 'landmarks') {
        if (d.landmarks) {
          const points = d.landmarks.positions.slice(0, 3)
            .map(p => `(${Math.round(p.x)}, ${Math.round(p.y)})`)
            .join(', ');
          tableHTML += `<td>${points}</td>`;
        } else {
          tableHTML += `<td>N/A</td>`;
        }
      }

      tableHTML += `</tr>`;
    });

    tableHTML += `</tbody></table>`;
    resultsTable.innerHTML = tableHTML;
  }
});
