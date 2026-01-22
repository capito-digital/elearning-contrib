import Adapt from 'core/js/adapt';
import ImageOrderingModel from './imageOrderingModel';
import ImageOrderingView from './imageOrderingView';

export default Adapt.register('imageOrdering', {
    model: ImageOrderingModel,
    view: ImageOrderingView
});
