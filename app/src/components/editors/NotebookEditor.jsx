/**
 * NotebookEditor — Milkdown Crepe-based WYSIWYG editor.
 *
 * This is the ONLY file that imports Milkdown. To swap editors in future,
 * replace this file while keeping the same props interface:
 *
 *   defaultValue  — initial markdown string (set once, not reactive)
 *   onChange      — (markdown: string) => void
 *   readOnly      — boolean
 *   onImageUpload — async (file: File) => string (returns filename)
 *   onEntitySearch — (entityType: 'project'|'client'|'timesheet') => void
 *   ref           — exposes { undo(), redo(), insertEntityLink(href, displayName), insertImage(src, alt), insertCodeBlock(code, language, sourceFilename) }
 */
import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { callCommand } from '@milkdown/kit/utils';
import { undoCommand, redoCommand } from '@milkdown/kit/plugin/history';
import { linkSchema, imageSchema, insertImageCommand, codeBlockSchema, paragraphSchema, clearTextInCurrentBlockCommand } from '@milkdown/kit/preset/commonmark';
import { commandsCtx, editorViewCtx } from '@milkdown/kit/core';
import { makeStyles, tokens } from '@fluentui/react-components';

import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';

// Simple SVG icons for slash menu items (24x24, matching Crepe's icon format)
const projectIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>`;
const clientIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
const timesheetIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>`;
const ticketIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 10V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v4c1.1 0 2 .9 2 2s-.9 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-2-1.46c-1.19.69-2 1.99-2 3.46s.81 2.77 2 3.46V18H4v-2.54c1.19-.69 2-1.99 2-3.46 0-1.48-.81-2.77-2-3.46V6h16v2.54z"/></svg>`;

const useStyles = makeStyles({
  wrapper: {
    flex: 1,
    width: '100%',
    '& .milkdown': {
      width: '100%',
      '--crepe-font-title': tokens.fontFamilyBase,
      '--crepe-font-default': tokens.fontFamilyBase,
    },
  },
});

const InnerEditor = forwardRef(function InnerEditor({ defaultValue, onChange, readOnly, onImageUpload, onEntitySearch }, ref) {
  const styles = useStyles();
  const onChangeRef = useRef(onChange);
  const onImageUploadRef = useRef(onImageUpload);
  const onEntitySearchRef = useRef(onEntitySearch);
  const crepeRef = useRef(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onImageUploadRef.current = onImageUpload; }, [onImageUpload]);
  useEffect(() => { onEntitySearchRef.current = onEntitySearch; }, [onEntitySearch]);

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: defaultValue || '',
      features: {
        [CrepeFeature.Latex]: false,
        [CrepeFeature.CodeMirror]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: 'Start writing, or type / for commands...',
          mode: 'doc',
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: async (file) => {
            if (!onImageUploadRef.current) return '';
            return onImageUploadRef.current(file);
          },
        },
        [CrepeFeature.BlockEdit]: {
          buildMenu: (builder) => {
            const entityGroup = builder.addGroup('entity-link', 'Link Entity');

            entityGroup.addItem('project', {
              label: 'Project',
              icon: projectIcon,
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                onEntitySearchRef.current?.('project');
              },
            });

            entityGroup.addItem('client', {
              label: 'Client',
              icon: clientIcon,
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                onEntitySearchRef.current?.('client');
              },
            });

            entityGroup.addItem('timesheet', {
              label: 'Timesheet',
              icon: timesheetIcon,
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                onEntitySearchRef.current?.('timesheet');
              },
            });

            entityGroup.addItem('ticket', {
              label: 'Ticket',
              icon: ticketIcon,
              onRun: (ctx) => {
                ctx.get(commandsCtx).call(clearTextInCurrentBlockCommand.key);
                onEntitySearchRef.current?.('ticket');
              },
            });
          },
        },
      },
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) {
          onChangeRef.current?.(markdown);
        }
      });
    });

    if (readOnly) {
      crepe.setReadonly(true);
    }

    crepeRef.current = crepe;
    return crepe;
  }, []);

  // Expose undo/redo and entity link insertion
  useImperativeHandle(ref, () => ({
    undo: () => {
      if (crepeRef.current?.editor) {
        crepeRef.current.editor.action(callCommand(undoCommand.key));
      }
    },
    redo: () => {
      if (crepeRef.current?.editor) {
        crepeRef.current.editor.action(callCommand(redoCommand.key));
      }
    },
    insertEntityLink: (href, displayName) => {
      if (!crepeRef.current?.editor) return;
      crepeRef.current.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from } = view.state.selection;
        const tr = view.state.tr.insertText(displayName, from);
        const mark = linkSchema.type(ctx).create({ href });
        tr.addMark(from, from + displayName.length, mark);
        view.dispatch(tr);
      });
    },
    insertImage: (src, alt) => {
      if (!crepeRef.current?.editor) return;
      crepeRef.current.editor.action(callCommand(insertImageCommand.key, { src, alt: alt || src }));
    },
    insertCodeBlock: (code, language, sourceFilename) => {
      if (!crepeRef.current?.editor) return;
      crepeRef.current.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        const { from } = view.state.selection;
        const schema = view.state.schema;

        // Build code block node
        const codeType = codeBlockSchema.type(ctx);
        const textNode = code ? schema.text(code) : null;
        const codeNode = codeType.create({ language: language || '' }, textNode);

        // Build source link paragraph: "Source: filename"
        const nodes = [codeNode];
        if (sourceFilename) {
          const paraType = paragraphSchema.type(ctx);
          const linkMark = linkSchema.type(ctx).create({ href: sourceFilename });
          const sourceText = schema.text('Source: ');
          const linkText = schema.text(sourceFilename, [linkMark]);
          const emMark = schema.marks.emphasis?.create();
          const para = paraType.create(null, [
            ...(emMark ? [sourceText.mark([emMark]), linkText.mark([emMark, linkMark])] : [sourceText, linkText]),
          ]);
          nodes.push(para);
        }

        const fragment = view.state.schema.nodes.doc ? nodes : nodes;
        let tr = view.state.tr;
        for (let i = nodes.length - 1; i >= 0; i--) {
          tr = tr.insert(from, nodes[i]);
        }
        view.dispatch(tr);
      });
    },
  }), []);

  return (
    <div className={styles.wrapper}>
      <Milkdown />
    </div>
  );
});

const NotebookEditor = forwardRef(function NotebookEditor(props, ref) {
  return (
    <MilkdownProvider>
      <InnerEditor ref={ref} {...props} />
    </MilkdownProvider>
  );
});

export default NotebookEditor;
