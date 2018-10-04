const chai = require('chai'),
    fse = require('fs-extra'),
    mockFs = require('mock-fs'),
    sinon = require('sinon');

const assert = chai.assert,
    expect = chai.expect;

const fsUtils = require('../../../lib/utils/fs-utils');


describe('Tests for lib/utils/fs-utils.js', () => {
    describe('recursiveRmDir function', () => {
        beforeEach(() => {
            mockFs({
                'test_top_level_dir': {
                    'myfile': 'this is a file',
                    'subdir': {
                        'another_file': 'abcdef',
                    },
                },
            });
        });

        afterEach(() => {
            mockFs.restore();
        });

        it('removes a directory and its contents', () => {
            assert(fse.existsSync('test_top_level_dir'));
            assert(fse.existsSync('test_top_level_dir/subdir/another_file'));
            fsUtils.recursiveRmDir('test_top_level_dir');
            assert(!fse.existsSync('test_top_level_dir'));
            assert(!fse.existsSync('test_top_level_dir/myfile'));
            assert(!fse.existsSync('test_top_level_dir/subdir/another_file'));

        });

        it('removes a subdirectory and its contents', () => {
            assert(fse.existsSync('test_top_level_dir'));
            assert(fse.existsSync('test_top_level_dir/subdir/another_file'));
            fsUtils.recursiveRmDir('test_top_level_dir/subdir');
            assert(fse.existsSync('test_top_level_dir'));
            assert(fse.existsSync('test_top_level_dir/myfile'));
            assert(!fse.existsSync('test_top_level_dir/subdir/another_file'));
        });

        it('throws an error if not given a directory', () => {
            expect(() => {
                fsUtils.recursiveRmDir('test_top_level_dir/subdir/another_file');
            }).to.throw();
        });

        it('throws an error if directory does not exist', () => {
            expect(() => {
                fsUtils.recursiveRmDir('this/does/not/exist/1234');
            }).to.throw();
        });

        it('throws an error if attempt to delete root dir', () => {
            expect(() => {
                fsUtils.recursiveRmDir('/');
            }).to.throw();
        });
    });

    describe('zipDirectory function', () => {
        beforeEach(() => {
            mockFs({
                'test_top_level_dir': {
                    'myfile': 'this is a file',
                    'subdir': {
                        'another_file': 'abcdef',
                    },
                },
            });
        });

        afterEach(() => {
            mockFs.restore();
        });

        it('zips a directory', done => {
            assert(!fse.existsSync('test_top_level_dir.zip'));
            fsUtils.zipDirectory('test_top_level_dir')
                .then(zipFile => {
                    expect(zipFile).to.equal('test_top_level_dir.zip');
                    assert(fse.existsSync('test_top_level_dir.zip'));
                    done();
                });
        });

        it('accepts an alternate suffix', done => {
            assert(!fse.existsSync('test_top_level_dir.coolzip'));
            fsUtils.zipDirectory('test_top_level_dir', '.coolzip')
                .then(zipFile => {
                    expect(zipFile).to.equal('test_top_level_dir.coolzip');
                    assert(fse.existsSync('test_top_level_dir.coolzip'));
                    done();
                });
        });

        it('rejects if directory does not exist', done => {
            assert(!fse.existsSync('this/does/not/exist/1234.zip'));
            fsUtils.zipDirectory('this/does/not/exist/1234')
                .catch(err => {
                    assert(!fse.existsSync('this/does/not/exist/1234.zip'));
                    done();
                });
        });

    });

});