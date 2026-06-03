module.exports = function({ types: t }) {
  return {
    name: 'transform-import-meta',
    visitor: {
      MetaProperty(path) {
        if (path.node.meta.name === 'import' && path.node.property.name === 'meta') {
          path.replaceWith(
            t.objectExpression([
              t.objectProperty(t.identifier('env'), t.objectExpression([
                t.objectProperty(t.identifier('MODE'), t.stringLiteral('development'))
              ]))
            ])
          );
        }
      }
    }
  };
};
