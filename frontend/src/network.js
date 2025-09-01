import { Network } from '@capacitor/network'; // to check internet connection
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';

export async function checkConnection(showToast = false) {
    const status = await Network.getStatus();
    if (!status.connected) {
        if (showToast) {
            toast.error('Please connect to the internet to do this');
        }
        return false;
    }
    return true;
}
  
Network.addListener('networkStatusChange', status => {
    console.log("Network changed");
    if (status.connected) {
        toast.success('Back online!', {id: 'network-status'});
    } else {
        toast.warning('Lost internet connection' + (Capacitor.getPlatform() !== 'web' ? '. You may continue to collect data, but will not be able to sync or generate reports.' : null), {id: 'network-status'});
    }
});