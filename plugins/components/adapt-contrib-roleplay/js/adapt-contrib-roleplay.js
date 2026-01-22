import components from 'core/js/components';
import RoleplayView from './roleplayView';
import RoleplayModel from './roleplayModel';

export default components.register('aiRoleplay', {
    view: RoleplayView,
    model: RoleplayModel
});
