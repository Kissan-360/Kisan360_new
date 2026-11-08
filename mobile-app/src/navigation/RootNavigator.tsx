import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import FirebaseTestScreen from "../screens/FirebaseTestScreen";
import DiseaseDetectionScreen from "../screens/DiseaseDetectionScreen";
import DecisionScreen from "../screens/DecisionScreen";
import TradeScreen from "../screens/TradeScreen";
import ChatScreen from "../screens/ChatScreen";
import SignInScreen from "../screens/SignInScreen";

const Stack = createStackNavigator();

const RootNavigator = () => {
  return (
    <Stack.Navigator initialRouteName="Decision">
      <Stack.Screen name="Decision" component={DecisionScreen} options={{ title: "Decision" }} />
      <Stack.Screen name="Trade" component={TradeScreen} options={{ title: "Trade" }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ title: "Ask Kisan360" }} />
      <Stack.Screen name="DiseaseDetection" component={DiseaseDetectionScreen} options={{ title: "Disease Detection" }} />
      <Stack.Screen name="SignIn" component={SignInScreen} options={{ title: "Sign in (demo)" }} />
      <Stack.Screen name="FirebaseTest" component={FirebaseTestScreen} options={{ title: "Firebase Connection Test" }} />
    </Stack.Navigator>
  );
};

export default RootNavigator;
