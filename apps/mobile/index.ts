/**
 * Expo entry point. Registers the root <App /> component with React Native
 * so both native (iOS/Android) and Expo web can boot it.
 */
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
