"""Generate one exercise illustration locally, with a locked style.

The first attempt taught two lessons that are now baked in here:

* **The prompt alone does not pin the variant.** A "bench press" came out as an incline
  bench. The style prompt below is fixed; the variant has to be spelled out and checked by
  eye — that is the human step this script cannot do.
* **The style has to be stated, not implied.** Without it the model drew a shirtless,
  barefoot athlete on a grey backdrop, which is not our app.

    C:/Users/rober/ComfyUI/venv/Scripts/python.exe design/art/comfy/run.py \
        --subject "flat barbell bench press, backrest completely horizontal" \
        --prefix rupfit/bench-press-flat --seed 4711

ComfyUI must be running on 8188. Every image is 1024 square, SDXL Turbo, 8 steps.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

SERVER = "http://127.0.0.1:8188"
CHECKPOINT = "DreamShaperXL_Turbo_v2_1.safetensors"

STYLE_HEAD = (
    "flat vector illustration, clean bold outlines, limited palette of dark ink and light "
    "lilac, male athlete wearing a dark men's training t-shirt that covers the whole chest and "
    "dark training shorts and white training shoes, "
)
STYLE_TAIL = (
    ", side view, whole body and equipment inside the frame, centred, exercise instruction "
    "artwork, no text"
)


def style(background: str) -> str:
    return STYLE_HEAD + background + STYLE_TAIL
NEGATIVE = (
    "photo, photorealistic, 3d render, gradient background, text, watermark, logo, extra limbs, "
    "deformed hands, cropped head, cropped feet, multiple people, clutter, shirtless, sports bra, "
    "crop top, tank top, bare midriff, female clothing, woman"
)


def workflow(
    subject: str,
    seed: int,
    steps: int,
    reference: str | None = None,
    pose: str | None = None,
    ip_weight: float = 0.85,
    background: str = "plain flat lilac background",
) -> dict:
    graph: dict = {
        "1": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT},
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {"clip": ["1", 1], "text": f"{subject}. {style(background)}"},
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {"clip": ["1", 1], "text": NEGATIVE},
        },
        "4": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 1024, "height": 1024, "batch_size": 1},
        },
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
                "seed": seed,
                "steps": steps,
                "cfg": 2.0,
                "sampler_name": "dpmpp_sde",
                "scheduler": "karras",
                "denoise": 1.0,
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": "x"}},
    }

    if reference is not None:
        # One character for the whole set: IPAdapter reads identity and palette from a
        # single approved picture, so the athlete stops being whoever the seed fancied.
        graph["8"] = {
            "class_type": "IPAdapterModelLoader",
            "inputs": {"ipadapter_file": "ip-adapter-plus_sdxl_vit-h.safetensors"},
        }
        graph["11"] = {
            "class_type": "CLIPVisionLoader",
            "inputs": {"clip_name": "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"},
        }
        graph["9"] = {"class_type": "LoadImage", "inputs": {"image": reference}}
        graph["10"] = {
            "class_type": "IPAdapterAdvanced",
            "inputs": {
                "model": ["1", 0],
                "ipadapter": ["8", 0],
                "clip_vision": ["11", 0],
                "image": ["9", 0],
                "weight": ip_weight,
                "weight_type": "linear",
                "combine_embeds": "concat",
                "start_at": 0.0,
                "end_at": 1.0,
                "embeds_scaling": "V only",
            },
        }
        graph["5"]["inputs"]["model"] = ["10", 0]

    if pose is not None:
        # The pose is drawn, not described: text lost "horizontal bench" three times in a
        # row. The skeleton comes from a reference photograph that already shows the exact
        # variant, so the model cannot argue with it.
        graph["20"] = {"class_type": "LoadImage", "inputs": {"image": pose}}
        graph["21"] = {
            "class_type": "OpenposePreprocessor",
            "inputs": {
                "image": ["20", 0],
                "detect_hand": "enable",
                "detect_body": "enable",
                "detect_face": "disable",
                "resolution": 1024,
                "scale_stick_for_xinsr_cn": "enable",
            },
        }
        graph["22"] = {
            "class_type": "ControlNetLoader",
            "inputs": {"control_net_name": "controlnet-openpose-sdxl-xinsir.safetensors"},
        }
        graph["23"] = {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["2", 0],
                "negative": ["3", 0],
                "control_net": ["22", 0],
                "image": ["21", 0],
                "strength": 1.0,
                "start_percent": 0.0,
                "end_percent": 1.0,
            },
        }
        graph["5"]["inputs"]["positive"] = ["23", 0]
        graph["5"]["inputs"]["negative"] = ["23", 1]

    return graph


def post(graph: dict, prefix: str) -> str:
    graph["7"]["inputs"]["filename_prefix"] = prefix
    payload = json.dumps({"prompt": graph, "client_id": "rupfit"}).encode()
    request = urllib.request.Request(
        f"{SERVER}/prompt", data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise SystemExit(f"rejected: {error.read().decode()[:1500]}") from error
    if "prompt_id" not in body:
        raise SystemExit(f"rejected: {json.dumps(body)[:800]}")
    return str(body["prompt_id"])


def wait(prompt_id: str, timeout: float = 300.0) -> list[str]:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with urllib.request.urlopen(f"{SERVER}/history/{prompt_id}", timeout=30) as response:
            history = json.loads(response.read().decode())
        entry = history.get(prompt_id)
        if entry is not None:
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise SystemExit(f"generation failed: {json.dumps(status)[:800]}")
            files = [
                f"{image.get('subfolder', '')}/{image.get('filename', '')}"
                for output in entry.get("outputs", {}).values()
                for image in output.get("images", [])
            ]
            if files:
                return files
        time.sleep(2)
    raise SystemExit("timeout waiting for the image")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subject", required=True, help="the variant, spelled out")
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--seed", type=int, default=4711)
    parser.add_argument("--steps", type=int, default=8)
    parser.add_argument(
        "--reference",
        help="file in ComfyUI/input used to lock the character and the palette (IPAdapter)",
    )
    parser.add_argument(
        "--background",
        default="plain flat lilac background",
        help="the backdrop asked for; use the app's own colour and no cut-out is needed",
    )
    parser.add_argument(
        "--ip-weight",
        type=float,
        default=0.85,
        help="how hard the reference image pulls; lower keeps identity, drops its clothing and style",
    )
    parser.add_argument(
        "--pose",
        help="file in ComfyUI/input whose skeleton drives the pose (OpenPose ControlNet)",
    )
    options = parser.parse_args()

    prompt_id = post(
        workflow(
            options.subject,
            options.seed,
            options.steps,
            options.reference,
            options.pose,
            options.ip_weight,
            options.background,
        ),
        options.prefix,
    )
    print(f"queued {prompt_id}", flush=True)
    for name in wait(prompt_id):
        print(name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
