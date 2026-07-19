describe('Graphic', function () {
  beforeEach(function () {
    cy.getData();
  });

  it('should display the graphic component', function () {
    const graphicComponents = this.data.components.filter(component => component._component === 'graphic');
    const stripHtml = cy.helpers.stripHtml;
    graphicComponents.forEach(graphicComponent => {
      cy.visit(`/#/preview/${graphicComponent._id}`);

      cy.testContainsOrNotExists('.graphic__body', stripHtml(graphicComponent.body));
      cy.testContainsOrNotExists('.graphic__title', stripHtml(graphicComponent.displayTitle));
      if(graphicComponent._graphic.large) {
        cy.get('.graphic__image').should('have.attr', 'src', graphicComponent._graphic.large);
      } else if(graphicComponent._graphic.src) {
        cy.get('.graphic__image').should('have.attr', 'src', graphicComponent._graphic.src);
      };

      if (!graphicComponent._graphic._url) {
        const popupImage = graphicComponent._graphic.large || graphicComponent._graphic.src;
        cy.get('.notify__popup.graphic').should('not.exist');
        cy.get('.js-graphic-link').click();
        cy.get('.notify__popup.graphic').should('be.visible');
        if (popupImage) {
          cy.get('.graphic__popup-image-inner').should('have.attr', 'src', popupImage);
        }
        cy.get('.notify__close-btn').click();
        cy.get('.notify__popup.graphic').should('not.exist');
      }

      // Make sure the current component is tested before moving to the next one
      // Custom cypress tests are async so we need to wait for them to pass first
      cy.wait(1000);
    });
  });
});
