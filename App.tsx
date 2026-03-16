import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {enableScreens} from 'react-native-screens';

import MainTabs from './src/navigation/MainTabs';
import PhotosphereScreen from './src/screens/PhotosphereScreen';
import FourDirectionCardsScreen from './src/screens/FourDirectionCardsScreen';
import DirectionCaptureScreen from './src/screens/DirectionCaptureScreen';

import HomeScreen from './src/screens/HomeScreen';
import ThreeDScreen from './src/screens/ThreeDScreen';

// Disable native screens to prevent Freeze component crash
enableScreens(false);

const Stack = createNativeStackNavigator();

function App(): React.JSX.Element {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{headerShown: false}}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen
          name="FourDirectionCards"
          component={FourDirectionCardsScreen}
          options={{
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="DirectionCapture"
          component={DirectionCaptureScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
        <Stack.Screen
          name="Photosphere"
          component={PhotosphereScreen}
          options={{
            presentation: 'fullScreenModal',
            animation: 'slide_from_bottom',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default App;
