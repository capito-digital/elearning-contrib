import Adapt from 'core/js/adapt';
import ImagePairingModel from './imagePairingModel';
import ImagePairingView from './imagePairingView';

export default Adapt.register('imagePairing', {
    model: ImagePairingModel,
    view: ImagePairingView
});
