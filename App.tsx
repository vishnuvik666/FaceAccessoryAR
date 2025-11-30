import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  Alert,
  Platform,
  PermissionsAndroid,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevices,
  useFrameProcessor,
  CameraPermissionStatus,
} from 'react-native-vision-camera';
import { scanFaces } from 'react-native-vision-camera-face-detector';
import { runOnJS } from 'react-native-reanimated';
import RNFS from 'react-native-fs';
import { Canvas, Image as SkImage, useImage } from '@shopify/react-native-skia';

export default function App() {
  const cameraRef = useRef<Camera>(null);
  const devices = useCameraDevices();

  console.log('devices', devices);
  const [device, setDevice] = useState(devices?.[1] || null);

  console.log('device', device);

  const [hasPermission, setHasPermission] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [landmarks, setLandmarks] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);

  const accessory = useImage(require('./assets/sunglasses.png'));

  // request permissions
  const requestPermissions = async () => {
    try {
      let cameraStatus = await Camera.getCameraPermissionStatus();
      if (cameraStatus !== 'authorized' && cameraStatus !== 'granted') {
        cameraStatus = await Camera.requestCameraPermission();
      }

      let micStatus = await Camera.getMicrophonePermissionStatus();
      if (micStatus !== 'authorized' && micStatus !== 'granted') {
        micStatus = await Camera.requestMicrophonePermission();
      }

      // Android extra permissions
      if (Platform.OS === 'android') {
        const audio = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        const storage = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
        );

        micStatus =
          micStatus === 'granted' ||
          audio === PermissionsAndroid.RESULTS.GRANTED;
        cameraStatus =
          cameraStatus === 'granted' ||
          storage === PermissionsAndroid.RESULTS.GRANTED;
      }

      if (cameraStatus && micStatus) {
        setHasPermission(true);
      } else {
        Alert.alert(
          'Permissions denied',
          'Cannot use camera/microphone. Enable them in Settings.',
        );
      }
    } catch (e: any) {
      Alert.alert('Permission Error', e.message);
    }
  };

  // dynamic front camera selection
  useEffect(() => {
    if (devices.front) setDevice(devices.front);
  }, [devices]);

  // frame processor
  const frameProcessor = useFrameProcessor(frame => {
    'worklet';
    try {
      const faces = scanFaces(frame);
      if (faces?.length > 0) {
        runOnJS(setLandmarks)(faces[0].landmarks);
      } else {
        runOnJS(setLandmarks)(null);
      }
    } catch (e) {
      // frame processor error
    }
  }, []);

  // start recording
  const startRecording = async () => {
    if (!cameraRef.current || !cameraReady) {
      Alert.alert('Camera not ready', 'Wait for camera initialization!');
      return;
    }

    setIsRecording(true);

    const saveDir =
      Platform.OS === 'android'
        ? `${RNFS.ExternalStorageDirectoryPath}/Movies/ARVideo`
        : `${RNFS.DocumentDirectoryPath}/ARVideo`;

    await RNFS.mkdir(saveDir);

    const savePath = `${saveDir}/AR_${Date.now()}.mp4`;

    cameraRef.current.startRecording({
      flash: 'off',
      filePath: savePath,
      onRecordingFinished: () => {
        setIsRecording(false);
        Alert.alert('🎉 Saved Successfully!', savePath);
      },
      onRecordingError: e => {
        console.log('Recording Error:', e);
        setIsRecording(false);
      },
    });

    // auto stop after 15s
    setTimeout(stopRecording, 15000);
  };

  const stopRecording = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    await cameraRef.current?.stopRecording();
  };

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.center}>
        <TouchableOpacity onPress={requestPermissions} style={styles.btn}>
          <Text style={styles.text}>Enable Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!cameraActive || !device) {
    return (
      <SafeAreaView style={styles.center}>
        <TouchableOpacity
          onPress={() => setCameraActive(true)}
          style={styles.btn}
        >
          <Text style={styles.text}>Open Camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // accessory overlay calculation
  let overlayX = 0,
    overlayY = 0,
    overlayW = 200,
    overlayH = 100;

  if (landmarks?.leftEye && landmarks?.rightEye) {
    const dx = landmarks.rightEye.x - landmarks.leftEye.x;
    const dy = landmarks.rightEye.y - landmarks.leftEye.y;
    const eyeDist = Math.sqrt(dx * dx + dy * dy);

    overlayW = eyeDist * 4;
    overlayH = eyeDist * 2;

    overlayX = landmarks.leftEye.x * 2 - overlayW * 0.5;
    overlayY = landmarks.leftEye.y * 3 - overlayH * 0.7;
  }

  return (
    <SafeAreaView style={styles.container}>
      <Camera
        ref={cameraRef}
        device={device}
        isActive={true}
        video={true}
        fps={30}
        style={StyleSheet.absoluteFill}
        frameProcessor={frameProcessor}
        onInitialized={() => setCameraReady(true)}
      />

      <Canvas style={StyleSheet.absoluteFill}>
        {accessory && landmarks && (
          <SkImage
            image={accessory}
            x={overlayX}
            y={overlayY}
            width={overlayW}
            height={overlayH}
          />
        )}
      </Canvas>

      <TouchableOpacity
        style={[styles.btn, isRecording && { backgroundColor: 'red' }]}
        onPress={isRecording ? stopRecording : startRecording}
      >
        <Text style={styles.text}>{isRecording ? 'Stop' : 'Record (15s)'}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btn: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    backgroundColor: '#1877f2',
    padding: 14,
    borderRadius: 10,
  },
  text: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
