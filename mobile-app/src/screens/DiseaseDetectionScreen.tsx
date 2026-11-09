import React, { useRef, useState } from "react";
import { ActivityIndicator, Button, Image, ScrollView, Share, Text, View } from "react-native";
import { Camera } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { Endpoints } from "../services/api";

const CROPS = ["Soybean", "Tomato", "Potato", "Grape", "Corn (Maize)", "Bell Pepper"];

export default function DiseaseDetectionScreen() {
  const [cameraPerm, setCameraPerm] = useState<any>(null);
  const [libPermission, requestLibPermission] = ImagePicker.useMediaLibraryPermissions();
  const cameraRef = useRef<any>(null);
  const [type] = useState<any>("back");
  const [uri, setUri] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [cropType, setCropType] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const requestCamera = async () => {
    const p = await Camera.requestCameraPermissionsAsync();
    setCameraPerm(p);
    return p;
  };

  const captureFromCamera = async () => {
    if (!cameraPerm?.granted) {
      const p = await requestCamera();
      if (!p.granted) return setError("Camera permission denied");
    }
    if (!cameraRef.current) {
      return takeViaPicker();
    }
    try {
      const photo = await cameraRef.current.takePicture({ base64: true, quality: 0.7 });
      setUri(photo.uri);
      setBase64(photo.base64 || null);
      setResult(null);
      setError("");
    } catch {
      return takeViaPicker();
    }
  };

  const takeViaPicker = async () => {
    if (!cameraPerm?.granted) {
      const p = await requestCamera();
      if (!p.granted) return setError("Camera permission denied");
    }
    const shot = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (shot.canceled || !shot.assets?.[0]) return;
    const asset = shot.assets[0];
    setUri(asset.uri);
    setBase64(asset.base64 || null);
    setResult(null);
    setError("");
  };

  const pickFromLibrary = async () => {
    if (!libPermission?.granted) {
      const p = await requestLibPermission();
      if (!p.granted) return setError("Media library permission denied");
    }
    const pick = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (pick.canceled || !pick.assets?.[0]) return;
    const asset = pick.assets[0];
    setUri(asset.uri);
    setBase64(asset.base64 || null);
    setResult(null);
    setError("");
  };

  const analyze = async () => {
    if (!base64 || !uri) return setError("Capture or pick a leaf photo first");
    setLoading(true);
    setError("");
    try {
      const res = await Endpoints.diseaseDetectBase64(
        `data:image/jpeg;base64,${base64}`,
        cropType || undefined,
      );
      setResult(res.data);
    } catch (e: any) {
      const body = e?.response?.data;
      if (body?.error === "not_a_plant" || body?.error === "crop_mismatch") {
        setError(body.message || body.error);
      } else if (body?.error === "ML service unavailable") {
        setError("Disease service offline — try again in a minute or use the web app.");
      } else {
        setError(body?.error || e.message || "Detection failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Crop disease — leaf photo</Text>
      <Text style={{ color: "#555", fontSize: 13 }}>
        Live preview (expo-camera) + gallery fallback. MobileNetV2 via FastAPI (canonical) — POST /api/disease/detect.
      </Text>

      <Text style={{ fontWeight: "600" }}>Crop (optional)</Text>
      <ScrollView horizontal>
        {CROPS.map((c) => (
          <Button key={c} title={c} onPress={() => setCropType(cropType === c ? "" : c)} />
        ))}
      </ScrollView>
      {cropType ? <Text style={{ color: "#006b2c", fontSize: 13 }}>Selected: {cropType}</Text> : null}

      {/* Live camera preview (SDK 49 Camera component) */}
      <View style={{ height: 220, borderRadius: 12, overflow: "hidden", backgroundColor: "#000" }}>
        {cameraPerm?.granted ? (
          <Camera ref={cameraRef} style={{ flex: 1 }} type={type} />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 16 }}>
            <Text style={{ color: "#fff", textAlign: "center" }}>
              Camera preview needs permission. You can still use “Take photo” or “Pick from gallery”.
            </Text>
            <Button title="Grant camera permission" onPress={requestCamera} />
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="Capture" onPress={captureFromCamera} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Pick from gallery" onPress={pickFromLibrary} />
        </View>
      </View>

      {uri ? <Image source={{ uri }} style={{ width: "100%", height: 160, borderRadius: 12, backgroundColor: "#eee" }} /> : null}
      <Button title={loading ? "Analyzing..." : "Detect disease"} onPress={analyze} disabled={loading || !base64} />
      {loading ? <ActivityIndicator /> : null}
      {!!error ? <Text style={{ color: "#b45309" }}>{error}</Text> : null}

      {result ? (
        <View style={{ gap: 6, padding: 12, borderWidth: 1, borderColor: "#d1fae5", borderRadius: 12, backgroundColor: "#f0fdf4" }}>
          <Text style={{ fontWeight: "700", fontSize: 16 }}>{result.detectedDisease}</Text>
          <Text>
            Severity: {result.severity} · Confidence: {(result.confidence * 100).toFixed(0)}% (latency {result.mlLatency}s)
          </Text>
          {result.recommendations?.length ? (
            <View style={{ gap: 2 }}>
              {result.recommendations.map((r: string, i: number) => (
                <Text key={i}>• {r}</Text>
              ))}
            </View>
          ) : null}
          {result.treatment ? <Text style={{ marginTop: 4 }}>Treatment: {result.treatment}</Text> : null}
          <Button
            title="Share result (WhatsApp)"
            onPress={() => {
              const text = `Kisan360: ${result.detectedDisease} — ${result.severity} · ${(result.confidence * 100).toFixed(0)}%. Treatment: ${result.treatment || "see Kisan360 app"}`;
              Share.share({ message: text }).catch(() => {});
            }}
          />
          <Text style={{ color: "#666", fontSize: 11 }}>Model: MobileNetV2 (38 classes) via FastAPI</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
