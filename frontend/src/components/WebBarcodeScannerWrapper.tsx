// Wrapper per import condizionale web-only
import { Platform } from 'react-native';

let WebBarcodeScannerComponent: React.ComponentType<any> | null = null;

// Solo su web, importa il componente
if (Platform.OS === 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    WebBarcodeScannerComponent = require('./WebBarcodeScanner').default;
  } catch (e) {
    console.error('Failed to load WebBarcodeScanner:', e);
  }
}

export default WebBarcodeScannerComponent;
