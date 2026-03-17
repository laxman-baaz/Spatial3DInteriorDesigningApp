import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {enableScreens} from 'react-native-screens';

import MainTabs from './src/navigation/MainTabs';
import WallScanScreen from './src/screens/WallScanScreen';
import WallCameraScreen from './src/screens/WallCameraScreen';
import {RoomScanProvider} from './src/context/RoomScanContext';

// Disable native screens to prevent Freeze component crash
enableScreens(false);

const Stack = createNativeStackNavigator();

function App(): React.JSX.Element {
  return (
    <RoomScanProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="WallScan"
            component={WallScanScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
          <Stack.Screen
            name="WallCamera"
            component={WallCameraScreen}
            options={{
              presentation: 'fullScreenModal',
              animation: 'slide_from_bottom',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </RoomScanProvider>
  );
}

export default App;
