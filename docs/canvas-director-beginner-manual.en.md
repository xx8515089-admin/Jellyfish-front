# Free Canvas and 3D Director Desk: Beginner's Manual

For first-time users. Follow the button names and complete one small exercise at a time.

Based on the interface and implementation on September 21, 2026. This guide focuses on **cloud canvases and Director Desk cloud projects**. Available models and features depend on your account and the messages shown in the app.

## 1. Choose what you want to do

| Your goal | Tool | Chapter |
| --- | --- | --- |
| Turn a sentence into an image | Free Canvas | 3 |
| Animate a character or product image | Free Canvas | 4 |
| Generate several shots | Free Canvas | 5 |
| Arrange characters, camera angles, and camera movement | 3D Director Desk | 7–8 |
| Use a 3D composition in a project's AI generation | Director Desk and project segments | 9 |
| Use both tools together | Director Desk, then Canvas | 10 |

Free Canvas is a worktable: place text, images, and generation tools, then connect them. Director Desk is a small film set: position characters, props, and cameras before generating your final images or videos.

Start with the image exercise in chapter 3 and the camera push-in in chapter 7.

## 2. A few words to know

| Term | Meaning |
| --- | --- |
| Node | A block on the canvas, such as Image Input or AI Video. |
| Connection | Passes content from one node to the next. |
| Prompt | Text explaining what you want AI to create. |
| Model | The AI tool that generates an image or video. |
| Shot / storyboard | A short continuous view. Three shots usually produce three separate clips. |
| Camera position | Where a camera sits and what it faces. |
| Camera movement | How the camera moves, such as slowly approaching a character. |
| Guide image | A reference showing composition and positions. |
| Revision / v1, v2 | A saved version of your work. |

Sign in first. For AI generation, select an available model and review the credit estimate. Generate only one result for your first exercise. Hover over unfamiliar icons to read their tooltips. **Bold text** below identifies controls or areas to look for.

## 3. Canvas exercise 1: Your first image

Goal: create an orange cat by a window and download it.

### Open a canvas

1. Open **Free Canvas** in the sidebar and click **New Canvas** in the list.
2. Click the project name at the top of the editor, enter “Cat practice”, and press `Enter`.
3. Check that the outer header says **Cloud Canvas** and that **Save and sync** is available.

If you are in a local canvas, use **Copy local canvas to cloud** and continue in the cloud copy. Browser-local content is not automatically available on other devices.

To create another canvas, return to the canvas list. The small plus beside the editor's project name creates an empty project by clearing the current content; it is not an additional canvas tab.

### Add an image-generation node

1. Double-click an empty part of the canvas and choose **AI Drawing**.
2. Paste this into the prompt box:

```text
An orange cat sits on a wooden windowsill, looking outside.
Warm afternoon sunlight comes from the side. A green garden is softly
blurred in the background. Realistic photography, clean image, no text.
```

3. Select an available image model. Use `1:1` if supported, otherwise keep an available default ratio.
4. Keep the default resolution and set quantity to `1` if offered.

If the model list is empty, open **API Settings → API and models → Refresh configuration**. Cloud provider keys are managed by the server. If no model becomes available, contact your administrator.

### Generate and apply

1. Click **Generate**, usually the triangle icon.
2. Check the reservation in the confirmation dialog and confirm.
3. Open **Save and sync → History / assets → Generation tasks**.
4. Wait for success and an image preview. Refresh if needed; do not repeatedly submit the same task.
5. Click **Apply result 1** under the successful task.
6. Check that the cat image appears in the original node.

A successful task and applying its result are separate steps. Results remain in history until you apply them. Applying replaces the target node's current content.

### Download and save

1. Select the result node and click **Download** in the top bar. You can also download from the asset library under **History / assets**; refresh assets if needed.
2. Click **Save to cloud** and wait for the saved-version status.

You are done when the image is on your computer and the canvas shows a saved revision. Downloading saves the finished image; cloud saving preserves the nodes, text, and connections.

## 4. Canvas exercise 2: Animate an image

Goal: make the cat slowly turn its head.

1. Double-click an empty area, choose **Image Input**, and upload the cat image. Wait for it to appear. You may also use the image-generation node from chapter 3 after applying its result.
2. Add an **AI Video** node.
3. Drag from the image node's output dot to the video node's input dot, then release.
4. Verify that the video node recognizes the reference image. Merely placing nodes beside one another does not connect them.
5. Enter this prompt:

```text
Keep the reference cat, windowsill, and background unchanged.
The cat slowly turns toward the camera, blinks gently, and moves its tail slightly.
Static camera, natural motion, stable image, no extra animals or text.
```

6. Choose a video model supporting reference images. Start with one reference and a supported short duration. Match the image ratio where possible and keep default resolution.
7. Generate, review the credit prompt, and confirm.
8. Wait in **Generation tasks**, then **Apply result 1**, preview, download, and **Save to cloud**.

You are done when the downloaded clip plays and the cat moves. Keep your first prompt simple: one action is enough.

For text-only video, add AI Video without an image and choose a model supporting text-to-video. Explain who is present, where they are, what they do, and how the camera moves.

Some advanced cloud media modes, including start/end frames and masks, are not yet available. Use ordinary text or single-reference generation for this exercise.

## 5. Canvas exercise 3: Three shots in one batch

1. Add a **Text Node** and enter:

```text
#1 Wide view of an afternoon garden, leaves moving gently, sunlight on a stone path, static camera.
#2 Medium shot of an orange cat on a windowsill, slowly turning its head, static camera.
#3 Close-up of the cat blinking slowly, softly blurred background, static camera.
```

2. Add a **Smart Storyboard**, connect the text output to its input, and select **Video**.
3. Click **Script** to import and split the upstream text. You should see three shots. If only an input box opens, check the connection and upstream text.
4. Check every prompt, model, ratio, resolution, and duration. Use the same ratio for all shots, such as `16:9` if supported.
5. For a consistent character, supply the same reference image to relevant shots and confirm that each model supports it. Text alone may produce different appearances.
6. Open **Batch** at the top of the storyboard. Select the three shots and set **Quantity per item** to `1`.
7. Click **Estimated cost**, check reserved credits and the **Credit reservation limit**, then **Confirm submission**.
8. Check overall progress under **Batch tasks** and individual results under **Generation tasks**.
9. **Apply result** for each chosen output, download the clips, and save the canvas.

Quantity per item means results per shot, not simultaneous tasks. A reservation limit controls the initial reservation; it does not cap final actual charges.

You are done when all three clips play. To make one finished film, place the clips in a video editor, arrange them, and add audio or subtitles.

## 6. Canvas controls, saving, and recovery

| Action | How |
| --- | --- |
| Add a node | Double-click empty canvas and choose a type. |
| Move a node | Drag its title or a non-input area. |
| Pan the canvas | Drag empty space with the left mouse button. |
| Zoom | Scroll over empty canvas. |
| Pass text or images | Drag an output dot to the next node's input dot. |
| Delete a node | Select it, then press `Delete`. |
| Undo | Use the top-bar undo control or `Ctrl + Z`. |
| Find a missing result | Check Generation tasks and the asset library in History / assets. |

Inside text fields, scrolling or Delete may edit text instead. Click the canvas or a node before operating on the canvas.

Before leaving, click **Save to cloud**, wait for a saved revision, and download important outputs separately. Autosave is attempted, but the success status is your confirmation. To try another version, save first and use **Revision history → Copy saved version**.

| Situation | What to do |
| --- | --- |
| Unsaved local draft found | Restore draft to keep editing, or use the cloud version if that is the version you want. |
| Recover last save appears | Check the previous save before making another. |
| Save conflict | Save a local project copy first. Loading the cloud version replaces your current editor content. |
| Submission has no clear response | Use Recover submission or Recover batch before submitting again. |
| An existing task has no result | Use Retrieve result if available. |
| A failed task needs another attempt | Retry submits the original version and may incur charges. If you changed the prompt, generate from the current node instead. |
| Media writes unavailable | Save text edits and use existing assets while waiting for service recovery. |

Retrieve result, Retry settlement, and Retry do different things. For uncertain results, recover or retrieve first; contact an administrator if still unresolved. Cancellation is a request and may not stop an already accepted, billable task.

## 7. Director Desk exercise 1: A simple push-in

Goal: move the camera slowly toward one character and export a 3D reference video.

### Create a cloud project

1. Open **3D Director Desk** in the sidebar and click **Cloud project**.
2. Under **Create new project**, enter “Character push-in” and choose **Create empty project**.
3. Verify that the toolbar shows your project name. To keep an existing scene, use **Save current scene as** instead.

### Add one character

1. Choose a preset under **Add Character**.
2. Select the character in the left object list.
3. Keep the default size and position it somewhere visible.
4. Use **Move**, **Rotate**, or **Scale** when needed.

Start with one character; add props after completing a shot.

### Apply a camera preset

1. Open **Camera Motion**, then the **One-click Shots** area.
2. Select your character as the tracking subject.
3. Start with a trajectory range of `100%`.
4. Choose **Basic Presets → Push In**.
5. Set total duration to five seconds, or keep the preset's default.
6. Verify that the path contains camera points and preview is available.

Push In moves toward the character; Pull Out moves away. A preset builds the route for you.

### Preview and export

1. Use **Preview Path** to check that the camera does not enter the floor or character.
2. Use the final camera-view preview to check composition. Keep the character in frame and avoid cutting off the head.
3. Increase duration if movement is too fast. Adjust range and preview again if needed.
4. Click **Save** in the cloud toolbar and wait for **Published version saved**.
5. Open **Export** in the camera-motion workspace, choose `720p` and `30 FPS`, then **Export MP4**.
6. Keep the page open during recording and encoding. Play the downloaded file to check it.

The director view lets you inspect the scene from outside. The final camera preview shows the active camera's framing. This export is a silent 3D camera reference, not a finished AI video in a realistic or illustrated style.

## 8. Director Desk exercise 2: Set your own start and end

1. Open Camera Motion and start camera control.
2. Click the 3D viewport once more to capture the mouse.
3. Move with `W / A / S / D`; use `E / Q` to move up or down.
4. Aim with the mouse and press `Enter` to record the start point.
5. Move elsewhere and press `Enter` for the end point.
6. Press `Esc` to exit camera control.
7. Check that the route has at least two points, then preview the final camera view.
8. Save and export as in chapter 7.

Alternatively, adjust the director view and add the current view as a camera point. Move the view and add another point.

| Desired movement | Where to set it |
| --- | --- |
| A character waves or acts in place | Select it and choose an available action on the right. |
| A character walks from A to B | Set the character's path on the right. |
| The camera approaches a character | Set a camera route in Camera Motion. |

A stationary character can still be filmed by a moving camera. You do not need a walking path for your first push-in.

## 9. Apply Director Desk references to project segments

### Enter from the target segment

1. Open a project's storyboard segment editor and select a segment.
2. Open its **3D Director Desk** entry.
3. Create a cloud project, or choose the corresponding project when prompted.

Entering from a segment links the correct destination.

### Arrange and bind characters

1. Position characters, props, and the camera.
2. If the project has character images, open **Character bindings → Refresh character options**.
3. Select the correct appearance reference for each 3D character.
4. **Save** to publish the bindings.

Bindings supply character images to later AI generation. They do not replace the appearance of the 3D models in front of you.

### For an image reference

1. Frame the scene and choose **Export and upload → Export and upload guide image**.
2. Wait for upload and inspect the actual image in the dialog.
3. Select **Include character references** if needed, then **Apply to segment image**.
4. To generate now, choose an image model and parameters, enter a prompt, and click **Generate image**. You can also generate from the segment editor later.

```text
Follow the character positions, shot size, and composition of the Director Desk guide image.
Use the attached character reference for the person on the left.
Set the scene in an afternoon garden with warm natural light, realistic cinema style, no text.
```

Applying links the reference. Generating submits a separate AI task.

### For a video reference

1. Create a camera route with at least two points and preview it.
2. Choose **Export and upload → Export and upload reference video**.
3. Wait for recording and upload, then preview the video.
4. **Load video models**, select a target model, and **Read references** to check existing segment references.
5. Include character references if needed, then **Apply to segment video**.
6. Return to the segment editor, refresh references and outputs, and start video generation.

You are done when the new references appear in the target segment. Applying does not generate the final video automatically. Supported reference types and parameters depend on the selected model and validation shown by the app.

## 10. Use both tools: Composition first, video next

1. Open Director Desk from a project segment and arrange one character and the camera.
2. Export and upload a guide image, apply it, and generate an image.
3. Download your preferred image from the segment's generation history.
4. In Free Canvas, add Image Input and upload that image.
5. Add AI Video and connect the image to it.
6. Describe the action and camera motion, choose a compatible model, and generate.
7. Apply the result from cloud task history, preview, download, and save.

This route transfers an image reference. An image does not contain the Director Desk camera route. For motion references, use the segment-video process in chapter 9 with a model supporting reference video.

## 11. Save Director Desk projects and recover versions

Before finishing:

1. Verify the current cloud project.
2. If you imported local models or motions, open **Cloud assets**.
3. Add external textures or materials with **Select dependency files** or **Select dependency folder**.
4. **Upload models and dependencies** and wait for success.
5. Click **Save** and wait for **Published version saved**.

A saved unpublished draft still needs Save to publish. Downloading an MP4 does not save an editable 3D project.

To keep two alternatives, open Cloud project, enter another name, and use Save current scene as.

Use **Outputs and history** to inspect old revisions. **View Director Desk source** in a segment's generation history opens the exact source version. Use **Copy current revision to continue editing** to work from a historical scene.

If **Check last publication / Retry original publication** appears, check first and follow the retry instructions to resolve the original request. For a version conflict, save a copy of the current scene before comparing drafts and published versions.

## 12. Troubleshooting

| Problem | First action |
| --- | --- |
| Double-click does not create a node | Double-click empty canvas, outside nodes and text fields. |
| Video node has no image reference | Check connection direction, input position, and model support. |
| Task succeeded but the node is empty | Open Generation tasks and Apply result. |
| Generate is disabled | Check model, required parameters, credits, drafts, conflicts, and pending submissions. |
| An image will not load | Retry preview or refresh assets before deleting anything. |
| Characters look inconsistent | Reuse the same reference image, verify it is attached to each shot, and request fewer changes. |
| Canvas is slow | Open Performance Mode and try the normal mode first. |
| Imported 3D model is invisible | Select it in the object list; check visibility, position, and scale. |
| No character binding candidates | Enter from a project segment, ensure character images exist, and refresh options. |
| Binding did not change the 3D appearance | Expected: it affects AI references, not the 3D model. |
| MP4 export is disabled | Ensure the active camera route has at least two points; try a basic preset. |
| Camera control ignores the mouse | Click the viewport again. Esc exits control. |
| Export has the wrong angle | Preview the active camera; check it is outside models and above the floor. |
| Export takes time | Keep the page open for real-time recording and encoding. |
| MP4 export is unsupported | Retry in a Chrome or Edge environment supporting MP4 recording. |
| Applying a video reference fails | Check upload, segment, and model; read the reference area again and follow validation messages. |
| Models or textures disappear on another device | Return to the original device, upload models and dependencies, then publish a saved version. |

If still stuck, give your administrator the step you were on, the exact error, and the task or project name.

## 13. Quick reference

| Task | Sequence |
| --- | --- |
| Generate an image | Canvas → AI Drawing → Prompt/model → Generate → Apply → Download → Save |
| Animate an image | Image Input → Connect to AI Video → Motion prompt → Generate → Apply → Download → Save |
| Three shots | Text → Smart Storyboard → Video → Script → Check settings → Batch → Estimate → Confirm → Apply |
| One-click push-in | Director Desk → Cloud project → Add character → Camera Motion → Subject → Push In → Preview → Save → Export MP4 |
| Project image reference | Enter from segment → Arrange → Save → Upload guide image → Apply to segment image → Generate |
| Project video reference | Camera route → Save → Upload reference video → Load model → Read references → Apply → Generate from segment |

After the exercises, you should have a saved cloud canvas, a saved Director Desk cloud project, and downloaded images or videos.
