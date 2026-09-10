import torch
import torch.nn.functional as F
import numpy as np
import cv2
from transformers import MobileNetV2ForImageClassification
from PIL import Image
from torchvision import transforms

MODEL_NAME = "linkanjarad/mobilenet_v2_1.0_224-plant-disease-identification"

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = None
id2label = None

def load_model():
    global model, id2label
    print(f"Loading model on {device}...")
    model = MobileNetV2ForImageClassification.from_pretrained(MODEL_NAME)
    model.to(device)
    model.eval()
    id2label = model.config.id2label
    print(f"Model loaded. {len(id2label)} classes.")
    print(f"Model input names: {getattr(model, 'model_input_names', ['pixel_values'])}")
    print(f"Model main input: {getattr(model, 'main_input_name', 'pixel_values')}")

load_model()

preprocess = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

def predict(image: Image.Image) -> dict:
    # ---- Image-level OOD checks ----
    img_np = np.array(image)
    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
    laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    has_texture = laplacian_var > 30

    # Color diversity: compute std across RGB channels
    # High diversity (noise) vs natural (mostly green)
    hsv = cv2.cvtColor(img_np, cv2.COLOR_RGB2HSV)
    hue_std = float(np.std(hsv[:, :, 0]))

    # Green dominance: fraction of pixels in green hue range (35-85 in OpenCV)
    green_mask = cv2.inRange(hsv, np.array([35, 30, 30]), np.array([85, 255, 255]))
    green_fraction = float(cv2.countNonZero(green_mask)) / (img_np.shape[0] * img_np.shape[1])

    # Reject if: no texture (solid) OR too chaotic (noise has high hue_std)
    # hue_std threshold calibrated against 14 real PlantVillage color images:
    #   natural backgrounds (soil, sky) push hue_std to 50-66 on valid leaf photos
    #   70 still catches genuinely chaotic/noisy non-plant images
    is_solid = not has_texture
    is_noise = hue_std > 70
    is_not_leaf_like = is_solid or is_noise

    # ---- Model-level prediction ----
    input_tensor = preprocess(image).unsqueeze(0).to(device)
    with torch.no_grad():
        input_name = getattr(model, 'main_input_name', 'pixel_values')
        outputs = model(**{input_name: input_tensor})
        logits = outputs.logits
        probs = F.softmax(logits, dim=1)
        top_prob, top_idx = torch.max(probs, 1)

    predicted_class = int(top_idx.item())
    confidence = float(top_prob.item())
    disease_name = id2label[predicted_class]

    top5_probs, top5_indices = torch.topk(probs, k=min(5, len(id2label)), dim=1)
    top5 = [
        {"class": int(idx.item()), "label": id2label[int(idx.item())], "confidence": float(prob.item())}
        for idx, prob in zip(top5_indices[0], top5_probs[0])
    ]

    # ---- OOD detection: combine image texture + model uncertainty ----
    eps = 1e-10
    entropy = -torch.sum(probs * torch.log(probs + eps), dim=1).item()
    max_entropy = len(id2label) * (1/len(id2label)) * -float(torch.log(torch.tensor(1/len(id2label) + eps)))
    norm_entropy = entropy / max_entropy if max_entropy > 0 else 0

    # Final OOD decision — strict: need both decent confidence AND image looks like a leaf
    # confidence threshold 0.40 calibrated: random on 38 classes is ~0.026;
    #   0.40 is 15x above random. Non-plant images score well below this.
    pass_model = confidence >= 0.40
    is_green_enough = green_fraction > 0.05  # at least 5% green pixels
    likely_plant = not is_not_leaf_like and pass_model and is_green_enough

    return {
        "predicted_class": predicted_class,
        "disease": disease_name,
        "confidence": round(confidence, 4),
        "likely_plant": bool(likely_plant),
        "entropy": round(norm_entropy, 4),
        "image_sharpness": round(laplacian_var, 1),
        "green_fraction": round(green_fraction, 3),
        "hue_std": round(hue_std, 1),
        "top5_predictions": top5,
    }
