/**
 * @license Copyright (c) 2003-2017, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import ModelTestEditor from '@ckeditor/ckeditor5-core/tests/_utils/modeltesteditor';
import Range from '@ckeditor/ckeditor5-engine/src/model/range';
import Position from '@ckeditor/ckeditor5-engine/src/model/position';
import Batch from '@ckeditor/ckeditor5-engine/src/model/batch';
import Text from '@ckeditor/ckeditor5-engine/src/model/text';
import UndoCommand from '../src/undocommand';
import { itemAt, getText } from '@ckeditor/ckeditor5-engine/tests/model/_utils/utils';

describe( 'UndoCommand', () => {
	let editor, model, doc, root, undo;

	beforeEach( () => {
		editor = new ModelTestEditor();
		undo = new UndoCommand( editor );

		model = editor.model;
		doc = model.document;

		root = doc.getRoot();
	} );

	afterEach( () => {
		return editor.destroy();
	} );

	describe( 'UndoCommand', () => {
		const p = pos => new Position( root, [].concat( pos ) );
		const r = ( a, b ) => new Range( p( a ), p( b ) );

		describe( 'execute()', () => {
			let batch0, batch1, batch2, batch3;

			beforeEach( () => {
				/*
				 [root]
				 - {}
				 */
				editor.model.document.selection.setRanges( [ r( 0, 0 ) ] );
				batch0 = new Batch();
				undo.addBatch( batch0 );
				model.enqueueChange( batch0, writer => {
					writer.insertText( 'foobar', p( 0 ) );
				} );

				/*
				 [root]
				 - f
				 - o
				 - o
				 - b
				 - a
				 - r{}
				 */
				// Let's make things spicy and this time, make a backward selection.
				editor.model.document.selection.setRanges( [ r( 2, 4 ) ], true );
				batch1 = new Batch();
				undo.addBatch( batch1 );
				model.enqueueChange( batch1, writer => {
					writer.setAttribute( 'key', 'value', r( 2, 4 ) );
				} );

				/*
				 [root]
				 - f
				 - o
				 - {o (key: value)
				 - b} (key: value)
				 - a
				 - r
				 */
				editor.model.document.selection.setRanges( [ r( 1, 3 ) ] );
				batch2 = new Batch();
				undo.addBatch( batch2 );
				model.enqueueChange( batch2, writer => {
					writer.move( r( 1, 3 ), p( 6 ) );
				} );

				/*
				 [root]
				 - f
				 - b (key: value)
				 - a
				 - r
				 - {o
				 - o} (key: value)
				 */
				editor.model.document.selection.setRanges( [ r( 1, 4 ) ] );
				batch3 = new Batch();
				undo.addBatch( batch3 );
				model.enqueueChange( batch3, writer => {
					writer.wrap( r( 1, 4 ), 'p' );
				} );

				/*
				 [root]
				 - f
				 - [p]
				 	- {b (key: value)
				 	- a
				 	- r}
				 - o
				 - o (key: value)
				 */
				editor.model.document.selection.setRanges( [ r( 0, 1 ) ] );
				model.enqueueChange( batch2, writer => {
					writer.move( r( 0, 1 ), p( 3 ) );
				} );

				/*
				 [root]
				 - [p]
				 	- b (key: value)
				 	- a
				 	- r
				 - o
				 - f
				 - o{} (key: value)
				 */
				editor.model.document.selection.setRanges( [ r( 4, 4 ) ] );
			} );

			it( 'should revert changes done by deltas from the batch that was most recently added to the command stack', () => {
				undo.execute();

				// Selection is restored. Wrap is removed:
				/*
				 [root]
				 - {b (key: value)
				 - a
				 - r}
				 - o
				 - f
				 - o (key: value)
				 */

				expect( getText( root ) ).to.equal( 'barofo' );
				expect( itemAt( root, 0 ).getAttribute( 'key' ) ).to.equal( 'value' );
				expect( itemAt( root, 5 ).getAttribute( 'key' ) ).to.equal( 'value' );

				expect( editor.model.document.selection.getFirstRange().isEqual( r( 0, 3 ) ) ).to.be.true;
				expect( editor.model.document.selection.isBackward ).to.be.false;

				undo.execute();

				// Two moves are removed:
				/*
				 [root]
				 - f
				 - {o
				 - o} (key: value)
				 - b (key: value)
				 - a
				 - r
				 */

				expect( getText( root ) ).to.equal( 'foobar' );
				expect( itemAt( root, 2 ).getAttribute( 'key' ) ).to.equal( 'value' );
				expect( itemAt( root, 3 ).getAttribute( 'key' ) ).to.equal( 'value' );

				// Since selection restoring is not 100% accurate, selected range is not perfectly correct
				// with what is expected in comment above. The correct result would be if range was [ 1 ] - [ 3 ].
				expect( editor.model.document.selection.getFirstRange().isEqual( r( 0, 3 ) ) ).to.be.true;
				expect( editor.model.document.selection.isBackward ).to.be.false;

				undo.execute();

				// Set attribute is undone:
				/*
				 [root]
				 - f
				 - o
				 - {o
				 - b}
				 - a
				 - r
				 */

				expect( getText( root ) ).to.equal( 'foobar' );
				expect( itemAt( root, 2 ).hasAttribute( 'key' ) ).to.be.false;
				expect( itemAt( root, 3 ).hasAttribute( 'key' ) ).to.be.false;

				expect( editor.model.document.selection.getFirstRange().isEqual( r( 2, 4 ) ) ).to.be.true;
				expect( editor.model.document.selection.isBackward ).to.be.true;

				undo.execute();

				// Insert is undone:
				/*
				 [root]
				 */

				expect( root.childCount ).to.equal( 0 );
				expect( editor.model.document.selection.getFirstRange().isEqual( r( 0, 0 ) ) ).to.be.true;
			} );

			it( 'should revert changes done by deltas from given batch, if parameter was passed (test: revert set attribute)', () => {
				undo.execute( batch1 );
				// Remove attribute:
				/*
				 [root]
				 - [p]
				 	- b
				 	- a
				 	- r
				 - o
				 - f
				 - o
				 */

				expect( itemAt( root, 0 ).name ).to.equal( 'p' );
				expect( getText( root.getChild( 0 ) ) ).to.equal( 'bar' );
				expect( root.getChild( 1 ).data ).to.equal( 'ofo' );

				expect( itemAt( root.getChild( 0 ), 0 ).hasAttribute( 'key' ) ).to.be.false;
				expect( itemAt( root, 2 ).hasAttribute( 'key' ) ).to.be.false;
				expect( itemAt( root, 3 ).hasAttribute( 'key' ) ).to.be.false;

				// Selection is only partially restored because the range got broken.
				// The selection would have to best on letter "b" and letter "o", but it is set only on letter "b".
				expect( editor.model.document.selection.getFirstRange().isEqual( r( [ 0, 0 ], [ 0, 1 ] ) ) ).to.be.true;
				expect( editor.model.document.selection.isBackward ).to.be.true;
			} );

			it( 'should revert changes done by deltas from given batch, if parameter was passed (test: revert insert foobar)', () => {
				undo.execute( batch0 );
				// Remove foobar:
				/*
				 [root]
				 - [p]
				 */

				// The `P` element wasn't removed because it wasn`t added by undone batch.
				// It would be perfect if the `P` got removed aswell because wrapping was on removed nodes.
				// But this would need a lot of logic / hardcoded ifs or a post-fixer.
				expect( root.childCount ).to.equal( 1 );
				expect( itemAt( root, 0 ).name ).to.equal( 'p' );

				expect( editor.model.document.selection.getFirstRange().isEqual( r( 1, 1 ) ) ).to.be.true;
				expect( editor.model.document.selection.isBackward ).to.be.false;

				undo.execute( batch1 );
				// Remove attributes.
				// This does nothing in the `root` because attributes were set on nodes that already got removed.
				// But those nodes should change in the graveyard and we can check them there.

				expect( root.childCount ).to.equal( 1 );
				expect( itemAt( root, 0 ).name ).to.equal( 'p' );

				// Operations for undoing that batch were working on graveyard so document selection should not change.
				expect( editor.model.document.selection.getFirstRange().isEqual( r( 1, 1 ) ) ).to.be.true;
				expect( editor.model.document.selection.isBackward ).to.be.false;

				expect( doc.graveyard.maxOffset ).to.equal( 6 );

				for ( const char of doc.graveyard._children ) {
					expect( char.hasAttribute( 'key' ) ).to.be.false;
				}

				// Let's undo wrapping. This will remove the P element and leave us with empty root.
				undo.execute( batch3 );
				expect( root.maxOffset ).to.equal( 0 );

				expect( editor.model.document.selection.getFirstRange().isEqual( r( 0, 0 ) ) ).to.be.true;
				expect( editor.model.document.selection.isBackward ).to.be.false;
			} );

			it( 'should omit deltas with non-document operations', () => {
				let element;

				model.change( writer => {
					element = writer.createElement( 'p' );

					undo.addBatch( writer.batch );

					writer.setAttribute( 'foo', 'bar', element );
					writer.setAttribute( 'foo', 'bar', root );

					undo.execute();
				} );

				expect( element.getAttribute( 'foo' ) ).to.equal( 'bar' );
				expect( root.getAttribute( 'foo' ) ).to.not.equal( 'bar' );
			} );
		} );

		it( 'merges touching ranges when restoring selection', () => {
			function getCaseText( root ) {
				let text = '';

				for ( let i = 0; i < root.childCount; i++ ) {
					const node = root.getChild( i );
					text += node.getAttribute( 'uppercase' ) ? node.data.toUpperCase() : node.data;
				}

				return text;
			}

			root.appendChildren( new Text( 'abcdef' ) );
			expect( getCaseText( root ) ).to.equal( 'abcdef' );

			editor.model.document.selection.setRanges( [ r( 1, 4 ) ] );
			const batch0 = new Batch();
			undo.addBatch( batch0 );
			model.enqueueChange( batch0, writer => {
				writer.setAttribute( 'uppercase', true, r( 1, 4 ) );
			} );
			expect( getCaseText( root ) ).to.equal( 'aBCDef' );

			editor.model.document.selection.setRanges( [ r( 3, 4 ) ] );
			const batch1 = new Batch();
			undo.addBatch( batch1 );
			model.enqueueChange( batch1, writer => {
				writer.move( r( 3, 4 ), p( 1 ) );
			} );
			expect( getCaseText( root ) ).to.equal( 'aDBCef' );

			undo.execute( batch0 );

			// After undo-attr: acdbef <--- "cdb" should be selected, it would look weird if only "cd" or "b" is selected
			// but the whole unbroken part "cdb" changed attribute.
			expect( getCaseText( root ) ).to.equal( 'adbcef' );
			expect( editor.model.document.selection.getFirstRange().isEqual( r( 1, 4 ) ) ).to.be.true;
		} );
	} );
} );
