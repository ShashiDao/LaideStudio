// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { EditorFindReplace } from './EditorFindReplace';

describe('EditorFindReplace Component', () => {
  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    isOpen: true,
    isReplaceOpen: false,
    onClose: vi.fn(),
    onToggleReplace: vi.fn(),
    searchTerm: '',
    setSearchTerm: vi.fn(),
    replaceTerm: '',
    setReplaceTerm: vi.fn(),
    caseSensitive: false,
    setCaseSensitive: vi.fn(),
    useRegex: false,
    setUseRegex: vi.fn(),
    matchWholeWord: false,
    setMatchWholeWord: vi.fn(),
    totalMatches: 0,
    currentMatchIndex: 0,
    onFindNext: vi.fn(),
    onFindPrevious: vi.fn(),
    onReplaceNext: vi.fn(),
    onReplaceAll: vi.fn(),
    regexError: null,
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(<EditorFindReplace {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders search input, options, and match counter', () => {
    render(
      <EditorFindReplace
        {...defaultProps}
        searchTerm="hello"
        totalMatches={5}
        currentMatchIndex={2}
      />
    );

    expect(screen.getByRole('region', { name: 'Find and Replace Bar' })).toBeDefined();
    expect(screen.getByPlaceholderText(/Find in file/i)).toBeDefined();
    expect(screen.getByText('2 of 5')).toBeDefined();
    expect(screen.getAllByLabelText('Match Case').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Match Whole Word').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Use Regular Expression').length).toBeGreaterThan(0);
  });

  it('displays 0 matches when search term exists with no matches', () => {
    render(
      <EditorFindReplace
        {...defaultProps}
        searchTerm="nonexistent"
        totalMatches={0}
        currentMatchIndex={0}
      />
    );

    expect(screen.getByText('0 matches')).toBeDefined();
  });

  it('displays regex error message when invalid regex is supplied', () => {
    render(
      <EditorFindReplace
        {...defaultProps}
        searchTerm="[unclosed"
        useRegex={true}
        regexError="Invalid regular expression: /[unclosed/ : Unterminated character class"
      />
    );

    expect(screen.getByText('Regex Error')).toBeDefined();
    expect(screen.getByText(/Unterminated character class/i)).toBeDefined();
  });

  it('calls onFindNext and onFindPrevious on button click and keyboard shortcuts', () => {
    const onFindNext = vi.fn();
    const onFindPrevious = vi.fn();

    render(
      <EditorFindReplace
        {...defaultProps}
        searchTerm="pattern"
        totalMatches={3}
        currentMatchIndex={1}
        onFindNext={onFindNext}
        onFindPrevious={onFindPrevious}
      />
    );

    const nextBtn = screen.getByLabelText('Next match');
    fireEvent.click(nextBtn);
    expect(onFindNext).toHaveBeenCalledTimes(1);

    const prevBtn = screen.getByLabelText('Previous match');
    fireEvent.click(prevBtn);
    expect(onFindPrevious).toHaveBeenCalledTimes(1);

    // Press Enter in search input
    const input = screen.getByPlaceholderText(/Find in file/i);
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(onFindNext).toHaveBeenCalledTimes(2);

    // Press Shift+Enter in search input
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onFindPrevious).toHaveBeenCalledTimes(2);
  });

  it('toggles replace row when replace toggle button is clicked', () => {
    const onToggleReplace = vi.fn();

    const { rerender } = render(
      <EditorFindReplace
        {...defaultProps}
        isReplaceOpen={false}
        onToggleReplace={onToggleReplace}
      />
    );

    const toggleBtn = screen.getByLabelText('Expand Replace Row');
    fireEvent.click(toggleBtn);
    expect(onToggleReplace).toHaveBeenCalledTimes(1);

    // Rerender with isReplaceOpen = true
    rerender(
      <EditorFindReplace
        {...defaultProps}
        isReplaceOpen={true}
        onToggleReplace={onToggleReplace}
      />
    );

    expect(screen.getByPlaceholderText(/Replace with/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Replace current match' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Replace all matches' })).toBeDefined();
  });

  it('handles Replace and Replace All button clicks and keyboard enter in replace input', () => {
    const onReplaceNext = vi.fn();
    const onReplaceAll = vi.fn();

    render(
      <EditorFindReplace
        {...defaultProps}
        searchTerm="target"
        replaceTerm="replacement"
        isReplaceOpen={true}
        totalMatches={2}
        onReplaceNext={onReplaceNext}
        onReplaceAll={onReplaceAll}
      />
    );

    const replaceBtn = screen.getByRole('button', { name: 'Replace current match' });
    fireEvent.click(replaceBtn);
    expect(onReplaceNext).toHaveBeenCalledTimes(1);

    const replaceAllBtn = screen.getByRole('button', { name: 'Replace all matches' });
    fireEvent.click(replaceAllBtn);
    expect(onReplaceAll).toHaveBeenCalledTimes(1);

    // Press Enter in replace input
    const replaceInput = screen.getByPlaceholderText(/Replace with/i);
    fireEvent.keyDown(replaceInput, { key: 'Enter', ctrlKey: false, metaKey: false });
    expect(onReplaceNext).toHaveBeenCalledTimes(2);

    // Press Ctrl+Enter in replace input
    fireEvent.keyDown(replaceInput, { key: 'Enter', ctrlKey: true });
    expect(onReplaceAll).toHaveBeenCalledTimes(2);
  });

  it('triggers onClose when Escape key is pressed or close button is clicked', () => {
    const onClose = vi.fn();

    render(
      <EditorFindReplace
        {...defaultProps}
        onClose={onClose}
      />
    );

    const closeBtn = screen.getByLabelText(/Close Find & Replace/i);
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const input = screen.getByPlaceholderText(/Find in file/i);
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('toggles Case Sensitive, Whole Word, and Regex flags', () => {
    const setCaseSensitive = vi.fn();
    const setMatchWholeWord = vi.fn();
    const setUseRegex = vi.fn();

    render(
      <EditorFindReplace
        {...defaultProps}
        setCaseSensitive={setCaseSensitive}
        setMatchWholeWord={setMatchWholeWord}
        setUseRegex={setUseRegex}
      />
    );

    fireEvent.click(screen.getAllByLabelText('Match Case')[0]);
    expect(setCaseSensitive).toHaveBeenCalled();

    fireEvent.click(screen.getAllByLabelText('Match Whole Word')[0]);
    expect(setMatchWholeWord).toHaveBeenCalled();

    fireEvent.click(screen.getAllByLabelText('Use Regular Expression')[0]);
    expect(setUseRegex).toHaveBeenCalled();
  });
});
