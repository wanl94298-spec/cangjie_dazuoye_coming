# Flux2 Image Generation API Documentation

**Base URL**: `http://140.143.183.163:38024` (Internal) / `https://ptp.matrixlabs.cn` (Public)

**Version**: 1.0.0

**Last Updated**: 2026-03-09

---

## Overview

This API provides AI-powered image generation capabilities using Flux2 Klein 9B model:

1. **Image-to-Image (P2P)**: Edit existing images with text instructions
2. **Text-to-Image (T2I)**: Generate new images from text descriptions
3. **Grid Generation (4 GPU Parallel)**: Generate 4 images simultaneously and compose a 2x2 grid
4. **Real-time Streaming**: Get live progress updates during generation via Server-Sent Events (SSE)

All endpoints use ComfyUI workflows running on GPU servers with automatic load balancing through FRP.

**New in v1.2.0**: Real-time streaming APIs (`/api/edit-stream` and `/api/generate-stream`) provide live progress updates during image generation, significantly improving user experience.

---

## Authentication

All API requests require an `accessCode` parameter for authentication.

**Endpoint**: `POST /api/auth`

**Content-Type**: `application/json`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `accessCode` | String | Yes | User access code |

**Example Request**:
```bash
curl -X POST https://ptp.matrixlabs.cn/api/auth \
  -H "Content-Type: application/json" \
  -d '{"accessCode": "ptp2025"}'
```

**Response**:
```json
{
  "success": true,
  "user": {
    "userId": "beta_user_001",
    "username": "Beta Tester",
    "plan": "beta",
    "planName": "Beta User",
    "credits": 999999,
    "creditCost": { "edit": 0, "generate": 0 }
  }
}
```

### Subscription Plans

**Endpoint**: `GET /api/plans?lang=en|zh`

Returns available subscription plans with localized names and features.

---

## API Endpoints

### 1. Health Check

Check if the service and ComfyUI backend are available.

**Endpoint**: `GET /api/health`

**Response**:
```json
{
  "status": "ok",
  "comfyui": "connected"
}
```

**Status Codes**:
- `200`: Service is healthy
- `503`: Service unavailable

---

### 2. Image-to-Image Editing (P2P)

Edit an existing image using natural language instructions. Based on Flux2 Klein's prompt-to-prompt editing capabilities.

#### Standard API (Non-streaming)

**Endpoint**: `POST /api/edit`

**Content-Type**: `multipart/form-data`

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image` | File | Yes | Image file (JPG, PNG, WEBP). Max 20MB |
| `prompt` | String | Yes | Text instructions describing the desired edits |
| `accessCode` | String | Yes | User access code |

**Example Request (cURL)**:
```bash
curl -X POST https://ptp.matrixlabs.cn/api/edit \
  -F "image=@/path/to/image.jpg" \
  -F "prompt=Replace the background with a sunset beach scene" \
  -F "accessCode=ptp2025"
```

**Response**:
```json
{
  "success": true,
  "image": "/outputs/abc123.png",
  "thumbnail": "/outputs/thumb_abc123.jpg",
  "prompt": "Replace the background with a sunset beach scene",
  "creditsUsed": 2,
  "creditsRemaining": 98
}
```

#### Streaming API (Real-time Progress)

**Endpoint**: `POST /api/edit-stream`

**Content-Type**: `multipart/form-data`

**Response Type**: `text/event-stream` (Server-Sent Events)

**Parameters**: Same as standard API

**Example Request (JavaScript)**:
```javascript
const formData = new FormData();
formData.append('image', fileInput.files[0]);
formData.append('prompt', 'Replace the background with a sunset beach scene');
formData.append('accessCode', 'ptp2025');

const response = await fetch('https://ptp.matrixlabs.cn/api/edit-stream', {
    method: 'POST',
    body: formData
});

// Process SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            // Update progress
            console.log(`Progress: ${data.progress}% - ${data.message}`);
            
            // Handle completion
            if (data.status === 'completed') {
                console.log('Result:', data.result);
            }
            
            // Handle error
            if (data.status === 'error') {
                console.error('Error:', data.error);
            }
        }
    }
}
```

**Event Stream Format**:

Progress events:
```
data: {"status": "initializing", "progress": 5, "message": "Uploading image..."}
data: {"status": "preparing", "progress": 15, "message": "Preparing workflow..."}
data: {"status": "queued", "progress": 20, "message": "Workflow submitted..."}
data: {"status": "processing", "progress": 50, "message": "Generating..."}
data: {"status": "downloading", "progress": 90, "message": "Downloading result..."}
data: {"status": "processing", "progress": 95, "message": "Generating thumbnail..."}
```

Completion event:
```json
{
  "status": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "image": "/outputs/abc123.png",
    "thumbnail": "/outputs/thumb_abc123.jpg",
    "prompt": "Replace the background with a sunset beach scene",
    "creditsUsed": 2,
    "creditsRemaining": 98
  }
}
```

Error event:
```json
{
  "status": "error",
  "error": "Error message"
}
```

**Processing Time**: Typically 10-30 seconds depending on image size and complexity

**Status Codes**:
- `200`: Success (streaming started)
- `400`: Bad request (missing parameters or invalid file)
- `401`: Unauthorized (invalid access code)
- `402`: Payment required (insufficient credits)
- `500`: Server error

**Prompt Guidelines**:
- Be specific about what to change
- Mention what to keep unchanged
- Use descriptive language
- Examples:
  - ✓ "Replace the background with a quiet coastal cliff at overcast sunset. Keep the subject's pose unchanged."
  - ✓ "Change the sky to starry night, add northern lights"
  - ✓ "Make it look like a vintage 1980s photograph with film grain"
  - ✗ "Make it better" (too vague)

**Technical Details**:
- Model: Flux2 Klein 9B FP8
- Resolution: Automatically scaled to 1 megapixel
- Steps: 4 (fast inference)
- CFG: 1.0
- Sampler: Euler

---

### 3. Text-to-Image Generation (T2I)

Generate new images from text descriptions using Flux2 Klein model.

#### Standard API (Non-streaming)

**Endpoint**: `POST /api/generate`

**Content-Type**: `application/json`

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | String | Yes | - | Text description of the image to generate |
| `width` | Integer | No | 1024 | Image width in pixels (256-2048) |
| `height` | Integer | No | 1024 | Image height in pixels (256-2048) |
| `steps` | Integer | No | 4 | Number of diffusion steps (1-50, Flux2 Klein optimized for 4 steps) |
| `cfg` | Float | No | 1.0 | Classifier-free guidance scale (Flux2 Klein optimized for 1.0) |
| `accessCode` | String | Yes | - | User access code |

**Example Request (cURL)**:
```bash
curl -X POST https://ptp.matrixlabs.cn/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A vintage motorcycle parked in front of a retro diner at sunset",
    "width": 1024,
    "height": 1024,
    "steps": 4,
    "cfg": 1.0,
    "accessCode": "ptp2025"
  }'
```

**Response**:
```json
{
  "success": true,
  "image": "/outputs/xyz789.png",
  "thumbnail": "/outputs/thumb_xyz789.jpg",
  "prompt": "A vintage motorcycle parked in front of a retro diner at sunset...",
  "width": 1024,
  "height": 1024,
  "seed": 432262096973502,
  "creditsUsed": 1,
  "creditsRemaining": 99
}
```

#### Streaming API (Real-time Progress)

**Endpoint**: `POST /api/generate-stream`

**Content-Type**: `application/json`

**Response Type**: `text/event-stream` (Server-Sent Events)

**Parameters**: Same as standard API

**Example Request (JavaScript)**:
```javascript
const response = await fetch('https://ptp.matrixlabs.cn/api/generate-stream', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        prompt: 'A futuristic cityscape at night, neon lights, cyberpunk style',
        width: 1024,
        height: 1024,
        steps: 4,
        cfg: 1.0,
        accessCode: 'ptp2025'
    })
});

// Process SSE stream
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            
            // Update progress bar
            if (data.progress !== undefined) {
                progressBar.style.width = `${data.progress}%`;
                progressText.textContent = `${data.progress}% - ${data.message || ''}`;
            }
            
            // Handle completion
            if (data.status === 'completed' && data.result) {
                displayImage(data.result.image);
                updateCredits(data.result.creditsRemaining);
            }
            
            // Handle error
            if (data.status === 'error') {
                showError(data.error);
            }
        }
    }
}
```

**Example Request (Python with SSE)**:
```python
import requests
import json

url = "https://ptp.matrixlabs.cn/api/generate-stream"
data = {
    "prompt": "A serene mountain landscape at dawn, misty valleys, golden sunlight",
    "width": 1024,
    "height": 1024,
    "steps": 4,
    "cfg": 1.0,
    "accessCode": "ptp2025"
}

response = requests.post(url, json=data, stream=True)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            event_data = json.loads(line[6:])
            
            # Print progress
            if 'progress' in event_data:
                print(f"Progress: {event_data['progress']}% - {event_data.get('message', '')}")
            
            # Handle completion
            if event_data.get('status') == 'completed':
                result = event_data['result']
                print(f"Image URL: https://ptp.matrixlabs.cn{result['image']}")
                print(f"Credits remaining: {result['creditsRemaining']}")
                break
            
            # Handle error
            if event_data.get('status') == 'error':
                print(f"Error: {event_data['error']}")
                break
```

**Event Stream Format**:

Progress events:
```
data: {"status": "initializing", "progress": 5, "message": "Preparing workflow..."}
data: {"status": "queued", "progress": 15, "message": "Workflow submitted..."}
data: {"status": "processing", "progress": 50, "message": "Generating..."}
data: {"status": "downloading", "progress": 90, "message": "Downloading result..."}
data: {"status": "processing", "progress": 95, "message": "Generating thumbnail..."}
```

Completion event:
```json
{
  "status": "completed",
  "progress": 100,
  "result": {
    "success": true,
    "image": "/outputs/xyz789.png",
    "thumbnail": "/outputs/thumb_xyz789.jpg",
    "prompt": "A vintage motorcycle...",
    "width": 1024,
    "height": 1024,
    "seed": 432262096973502,
    "creditsUsed": 1,
    "creditsRemaining": 99
  }
}
```

Error event:
```json
{
  "status": "error",
  "error": "Error message"
}
```

**Processing Time**: Typically 5-15 seconds depending on resolution (Flux2 Klein is optimized for fast inference)

**Status Codes**:
- `200`: Success (streaming started)
- `400`: Bad request (missing prompt or invalid parameters)
- `401`: Unauthorized (invalid access code)
- `402`: Payment required (insufficient credits)
- `500`: Server error

**Prompt Guidelines for T2I**:
- Be descriptive and specific
- Include style, lighting, mood, composition
- Mention artistic style or photography type
- Examples:
  - ✓ "A vintage motorcycle parked in front of a retro diner at sunset, warm orange and pink sky, neon signs glowing, 80s vintage photo style, film grain"
  - ✓ "Portrait of a young woman with flowing red hair, soft natural lighting, shallow depth of field, professional photography, bokeh background"
  - ✓ "Futuristic cityscape at night, neon lights reflecting on wet streets, cyberpunk style, cinematic composition, high contrast"
  - ✗ "A nice picture" (too vague)

**Parameter Guidelines**:
- **Width/Height**: Multiples of 64 work best. Common: 512, 768, 1024, 1536
- **Steps**: 
  - 4: Optimal for Flux2 Klein (fast, high quality)
  - 8-12: Higher quality, slower
  - 20+: Diminishing returns for Flux2 Klein
- **CFG**: 
  - 1.0: Optimal for Flux2 Klein (recommended)
  - 1.5-3.0: More guidance, may reduce quality
  - Higher values not recommended for Flux2 Klein

**Technical Details**:
- Model: Flux2 Klein 9B FP8 (optimized for fast inference)
- Sampler: Euler
- VAE: Flux2 VAE
- Default Steps: 4 (optimal for Flux2 Klein)
- Default CFG: 1.0 (optimal for Flux2 Klein)
- Max Resolution: 2048x2048
- Recommended: 1024x1024 or 1024x1408 (portrait)

---

## Real-time Streaming API Guide

### Why Use Streaming APIs?

Traditional APIs require users to wait without feedback until the entire generation process completes. Streaming APIs provide:

- **Real-time progress updates**: See exactly what's happening (queued, processing, downloading, etc.)
- **Better user experience**: Progress bars and status messages keep users informed
- **Early error detection**: Know immediately if something goes wrong
- **Perceived performance**: Users feel the system is more responsive

### When to Use Streaming vs Standard APIs

**Use Streaming APIs (`/api/edit-stream`, `/api/generate-stream`) when:**
- Building interactive web applications
- Users need visual feedback during generation
- You want to display progress bars or status messages
- Generation time is significant (>5 seconds)

**Use Standard APIs (`/api/edit`, `/api/generate`) when:**
- Building batch processing systems
- Progress updates are not needed
- Simpler integration is preferred
- Working with systems that don't support SSE

### Server-Sent Events (SSE) Basics

SSE is a standard for servers to push real-time updates to clients over HTTP. Unlike WebSockets, SSE:
- Uses regular HTTP (no special protocol)
- Automatically reconnects on connection loss
- Works through most proxies and firewalls
- Simpler to implement than WebSockets

### Event Types

All streaming APIs emit events with the following structure:

```json
{
  "status": "string",      // Current status
  "progress": 0-100,       // Progress percentage
  "message": "string",     // Human-readable message (optional)
  "result": {...},         // Final result (only in completed event)
  "error": "string"        // Error message (only in error event)
}
```

**Status values**:
- `initializing`: Starting the process
- `preparing`: Preparing workflow
- `queued`: Waiting in queue
- `processing`: Actively generating
- `downloading`: Downloading result
- `completed`: Generation finished successfully
- `error`: An error occurred

### Browser Implementation Example

```javascript
async function generateImageWithProgress(prompt, onProgress) {
    const response = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt: prompt,
            width: 1024,
            height: 1024,
            steps: 4,
            cfg: 1.0,
            accessCode: 'ptp2025'
        })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const event = JSON.parse(line.slice(6));
                
                // Call progress callback
                onProgress(event);
                
                // Return result on completion
                if (event.status === 'completed') {
                    return event.result;
                }
                
                // Throw error on failure
                if (event.status === 'error') {
                    throw new Error(event.error);
                }
            }
        }
    }
}

// Usage
generateImageWithProgress('A beautiful sunset', (event) => {
    console.log(`${event.progress}%: ${event.message || event.status}`);
    updateProgressBar(event.progress);
}).then(result => {
    console.log('Image generated:', result.image);
}).catch(error => {
    console.error('Generation failed:', error);
});
```

### Python Implementation Example

```python
import requests
import json

def generate_image_with_progress(prompt, on_progress):
    url = "https://ptp.matrixlabs.cn/api/generate-stream"
    data = {
        "prompt": prompt,
        "width": 1024,
        "height": 1024,
        "steps": 4,
        "cfg": 1.0,
        "accessCode": "ptp2025"
    }
    
    response = requests.post(url, json=data, stream=True)
    
    for line in response.iter_lines():
        if line:
            line = line.decode('utf-8')
            if line.startswith('data: '):
                event = json.loads(line[6:])
                
                # Call progress callback
                on_progress(event)
                
                # Return result on completion
                if event.get('status') == 'completed':
                    return event['result']
                
                # Raise error on failure
                if event.get('status') == 'error':
                    raise Exception(event['error'])

# Usage
def print_progress(event):
    progress = event.get('progress', 0)
    message = event.get('message', event.get('status', ''))
    print(f"{progress}%: {message}")

try:
    result = generate_image_with_progress("A beautiful sunset", print_progress)
    print(f"Image generated: {result['image']}")
except Exception as e:
    print(f"Generation failed: {e}")
```

### Error Handling

Always handle both network errors and generation errors:

```javascript
try {
    const result = await generateImageWithProgress(prompt, onProgress);
    // Success
} catch (error) {
    if (error.message.includes('Insufficient credits')) {
        // Handle credit error
        showUpgradePrompt();
    } else if (error.message.includes('Timeout')) {
        // Handle timeout
        showRetryButton();
    } else {
        // Handle other errors
        showErrorMessage(error.message);
    }
}
```

### Performance Tips

1. **Connection Management**: SSE connections are long-lived. Close them properly when done.
2. **Buffering**: Always buffer incomplete lines when parsing SSE streams.
3. **Timeouts**: Set appropriate timeouts (default: 5 minutes).
4. **Reconnection**: Implement reconnection logic for network failures.
5. **Progress Throttling**: Update UI at most once per 100ms to avoid performance issues.

### Comparison: Streaming vs Standard

| Feature | Streaming API | Standard API |
|---------|--------------|--------------|
| Progress updates | ✅ Real-time | ❌ None |
| User feedback | ✅ Detailed | ❌ Minimal |
| Implementation | More complex | Simple |
| Network overhead | Slightly higher | Lower |
| Error detection | Immediate | At end only |
| Best for | Web apps | Batch processing |

---

### 4. Grid Generation (4 GPU Parallel)

Generate 4 images simultaneously using 4 GPU instances and compose them into a 2x2 grid. Same generation time as a single image.

**Endpoint**: `POST /api/generate-grid`

**Content-Type**: `application/json`

**Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | String | Yes | - | Text description of the image to generate |
| `width` | Integer | No | 1024 | Single image width in pixels (256-2048) |
| `height` | Integer | No | 1024 | Single image height in pixels (256-2048) |
| `steps` | Integer | No | 4 | Number of diffusion steps (1-50) |
| `cfg` | Float | No | 1.0 | Classifier-free guidance scale |
| `accessCode` | String | Yes | - | User access code |

**Example Request (cURL)**:
```bash
curl -X POST https://ptp.matrixlabs.cn/api/generate-grid \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A vintage motorcycle parked in front of a retro diner at sunset",
    "width": 1024,
    "height": 1024,
    "steps": 4,
    "cfg": 1.0,
    "accessCode": "ptp2025"
  }'
```

**Response**:
```json
{
  "success": true,
  "image": "/outputs/grid_abc123.png",
  "thumbnail": "/outputs/thumb_grid_abc123.jpg",
  "individual_images": [
    "/outputs/img1.png",
    "/outputs/img2.png",
    "/outputs/img3.png",
    "/outputs/img4.png"
  ],
  "prompt": "A vintage motorcycle...",
  "width": 2048,
  "height": 2048,
  "seed": 432262096973502,
  "creditsUsed": 4,
  "creditsRemaining": 999995
}
```

**Response Fields**:
- `image` (string): URL to the 2x2 grid composite image
- `thumbnail` (string): URL to the grid thumbnail (1200px width)
- `individual_images` (array): URLs to each of the 4 individual images
- `width`/`height` (integer): Grid dimensions (2x single image size)
- `creditsUsed` (integer): Total credits consumed (4x generate cost)
- `creditsRemaining` (integer): User's remaining credits

**Processing Time**: Same as single image (~5-15 seconds) due to parallel GPU execution

**Credit Cost**: 4x the single generate cost (4 images generated)

**Requirements**: 4 ComfyUI instances must be running on ports 8188-8191

---

## Integration Examples

### Node.js/Express Integration

```javascript
const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const app = express();

// Proxy to P2P service
app.post('/edit-image', async (req, res) => {
    try {
        const formData = new FormData();
        formData.append('image', fs.createReadStream(req.file.path));
        formData.append('prompt', req.body.prompt);
        
        const response = await axios.post(
            'https://ptp.matrixlabs.cn/api/edit',
            formData,
            { headers: formData.getHeaders() }
        );
        
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000);
```

### Python/Flask Integration

```python
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route('/edit-image', methods=['POST'])
def edit_image():
    """Image-to-Image editing"""
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    files = {'image': request.files['image']}
    data = {'prompt': request.form.get('prompt')}
    
    response = requests.post(
        'https://ptp.matrixlabs.cn/api/edit',
        files=files,
        data=data
    )
    
    return jsonify(response.json())

@app.route('/generate-image', methods=['POST'])
def generate_image():
    """Text-to-Image generation"""
    data = request.get_json()
    
    response = requests.post(
        'https://ptp.matrixlabs.cn/api/generate',
        json=data
    )
    
    return jsonify(response.json())

if __name__ == '__main__':
    app.run(port=5000)
```

### React Frontend Integration

```jsx
import React, { useState } from 'react';

function ImageEditor() {
    const [image, setImage] = useState(null);
    const [prompt, setPrompt] = useState('');
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);

    // Image-to-Image editing
    const handleEdit = async (e) => {
        e.preventDefault();
        setLoading(true);

        const formData = new FormData();
        formData.append('image', image);
        formData.append('prompt', prompt);

        try {
            const response = await fetch('https://ptp.matrixlabs.cn/api/edit', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            setResult(`https://ptp.matrixlabs.cn${data.image}`);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Text-to-Image generation
    const handleGenerate = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch('https://ptp.matrixlabs.cn/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: prompt,
                    width: 1024,
                    height: 1024,
                    steps: 20,
                    cfg: 5.0
                })
            });
            const data = await response.json();
            setResult(`https://ptp.matrixlabs.cn${data.image}`);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            <h2>Image Editor</h2>
            <form onSubmit={handleEdit}>
                <input 
                    type="file" 
                    onChange={(e) => setImage(e.target.files[0])}
                    accept="image/*"
                />
                <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your edits or image..."
                />
                <button type="submit" disabled={loading}>
                    {loading ? 'Processing...' : 'Edit Image'}
                </button>
                <button type="button" onClick={handleGenerate} disabled={loading}>
                    {loading ? 'Processing...' : 'Generate from Text'}
                </button>
            </form>
            {result && <img src={result} alt="Result" />}
        </div>
    );
}
```

---

## Rate Limiting & Best Practices

**Current Limits**:
- No hard rate limits currently enforced
- Recommended: Max 10 concurrent requests
- Processing time: 10-30 seconds per request

**Best Practices**:
1. **Implement client-side queuing** for multiple requests
2. **Show progress indicators** to users (processing takes time)
3. **Cache results** when possible (same image + prompt = same result with fixed seed)
4. **Validate file sizes** before upload (max 20MB)
5. **Handle timeouts gracefully** (set timeout to 5 minutes)
6. **Compress images** before upload if possible
7. **Use appropriate image formats**: JPG for photos, PNG for graphics

---

## Error Handling

**Common Errors**:

| Error | Cause | Solution |
|-------|-------|----------|
| `No image uploaded` | Missing image file | Include image in multipart form |
| `Prompt is required` | Empty or missing prompt | Provide non-empty prompt text |
| `Only image files are allowed` | Invalid file type | Use JPG, PNG, or WEBP |
| `File size must be less than 20MB` | File too large | Compress or resize image |
| `Timeout waiting for image generation` | ComfyUI overloaded or crashed | Retry after a few minutes |
| `Service unavailable` | ComfyUI not running | Contact administrator |

**Error Response Format**:
```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

---

## System Architecture

```
┌─────────────┐
│   Client    │
│ Application │
└──────┬──────┘
       │ HTTPS
       ↓
┌─────────────────────┐
│  Public Server      │
│  140.143.183.163    │
│  ├─ Nginx (SSL)     │
│  └─ FRP Server      │
└──────┬──────────────┘
       │ FRP Tunnel
       │ Port 38024
       ↓
┌──────────────────────────────┐
│  Campus Server               │
│  10.143.12.80                │
│  ├─ Node.js API (port 38024) │
│  └─ ComfyUI Instances        │
│     ├─ GPU 4 → :8188         │
│     ├─ GPU 5 → :8189         │
│     ├─ GPU 6 → :8190         │
│     └─ GPU 7 → :8191         │
│     └─ Flux2 Klein 9B FP8    │
│        8x A100 40GB          │
└──────────────────────────────┘
```

**Components**:
- **Nginx**: SSL termination, reverse proxy
- **FRP**: Internal network penetration
- **Node.js**: API server, request handling
- **ComfyUI**: Workflow execution engine
- **Flux2 Klein**: AI model (9B parameters, FP8 quantized)

---

## Performance Metrics

**Hardware**:
- GPU: 8x NVIDIA A100 40GB
- Model: Flux2 Klein 9B FP8
- VRAM Usage: ~10GB per request

**Benchmarks**:
- Image-to-Image (P2P): 10-15 seconds (4 steps)
- Text-to-Image (T2I): 5-15 seconds (4 steps, Flux2 Klein fast mode)
- Grid Generation: 5-15 seconds (4 images parallel, same as single)
- Throughput: ~6-10 images/minute (single GPU), ~24-40 images/minute (4 GPU parallel)
- Max Resolution: 2048x2048 (1024x1024 recommended)

---

## Changelog

### v1.2.0 (2026-03-09)
- Added real-time streaming APIs (`/api/edit-stream` and `/api/generate-stream`)
- Server-Sent Events (SSE) support for live progress updates
- Improved user experience with real-time progress bars
- Better error handling and status reporting during generation
- Backward compatible with existing non-streaming APIs

### v1.1.0 (2026-03-09)
- Added 4 GPU parallel grid generation (`/api/generate-grid`)
- Added user authentication system (`/api/auth`)
- Added subscription plans API (`/api/plans`)
- Added credit-based billing system
- Added multi-language support (English/Chinese)
- Updated architecture to support 4 ComfyUI instances

### v1.0.0 (2026-03-07)
- Initial release
- Image-to-Image editing API
- Text-to-Image workflow documentation
- Access code authentication
- Mobile responsive web interface
- HTTPS support with Let's Encrypt

---

## Support & Contact

**Issues**: Report bugs or request features via GitHub Issues

**Documentation**: This file is maintained at `/home/Matrix/yz/AI-movie/p2p-server/API_DOCUMENTATION.md`

**Model Information**:
- Flux2 Klein: https://huggingface.co/black-forest-labs/FLUX.2-klein-9b-fp8
- ComfyUI: https://github.com/comfyanonymous/ComfyUI

---

## License & Usage Terms

This API is provided for internal testing and development purposes. 

**Restrictions**:
- Beta access only (access code required)
- No commercial use without permission
- Rate limits may be enforced
- Service availability not guaranteed

**Model License**: Flux2 Klein follows Black Forest Labs' licensing terms

---

**End of Documentation**
