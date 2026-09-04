// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { db } from '../../db';
import { SettingsSkillsSection } from './SettingsSkillsSection';
import { seedDefaultSkills } from '../../services/agent/skills';

describe('SettingsSkillsSection', () => {
  beforeEach(async () => {
    await db.skills.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders skills section with default seeded skills', async () => {
    await seedDefaultSkills();
    render(<SettingsSkillsSection />);

    await waitFor(() => {
      expect(screen.getByText('Skills Library')).toBeDefined();
      expect(screen.getByText(/Tailwind conventions used in this repo/)).toBeDefined();
      expect(screen.getByText(/How to write a Vitest test here/)).toBeDefined();
    });
  });

  it('allows adding a new skill via the form', async () => {
    render(<SettingsSkillsSection />);

    await waitFor(() => {
      expect(screen.getByText('Skills Library')).toBeDefined();
    });

    const nameInput = screen.getByRole('textbox', { name: /Skill Name/i });
    const descInput = screen.getByRole('textbox', { name: /Description/i });
    const kwInput = screen.getByRole('textbox', { name: /Trigger Keywords/i });
    const contentInput = screen.getByRole('textbox', { name: /Markdown Instructions/i });
    const submitBtn = screen.getByRole('button', { name: /Add Skill/i });

    fireEvent.change(nameInput, { target: { value: 'React Router Conventions' } });
    fireEvent.change(descInput, { target: { value: 'Routing practices' } });
    fireEvent.change(kwInput, { target: { value: 'router, routing, navigation' } });
    fireEvent.change(contentInput, { target: { value: 'Use createBrowserRouter and Link.' } });

    fireEvent.click(submitBtn);

    await waitFor(async () => {
      expect(await db.skills.where('name').equals('React Router Conventions').count()).toBe(1);
      expect(screen.getByText('React Router Conventions')).toBeDefined();
    });
  });

  it('allows editing an existing skill', async () => {
    await db.skills.add({
      id: 'skill-editable',
      name: 'Original Name',
      description: 'Original Desc',
      keywords: ['orig'],
      content: 'Original Content',
      createdAt: 100,
      updatedAt: 100
    });

    render(<SettingsSkillsSection />);

    await waitFor(() => {
      expect(screen.getByText('Original Name')).toBeDefined();
    });

    const editBtn = screen.getByLabelText('Edit Original Name');
    fireEvent.click(editBtn);

    const nameInput = screen.getByRole('textbox', { name: /Skill Name/i });
    expect((nameInput as HTMLInputElement).value).toBe('Original Name');

    fireEvent.change(nameInput, { target: { value: 'Updated Skill Name' } });
    const updateBtn = screen.getByRole('button', { name: /Update Skill/i });
    fireEvent.click(updateBtn);

    await waitFor(async () => {
      const updated = await db.skills.get('skill-editable');
      expect(updated?.name).toBe('Updated Skill Name');
      expect(screen.getByText('Updated Skill Name')).toBeDefined();
    });
  });

  it('allows deleting a skill', async () => {
    await db.skills.add({
      id: 'skill-to-delete',
      name: 'Temporary Skill',
      description: 'Will be deleted',
      keywords: ['temp'],
      content: 'Goodbye',
      createdAt: 100,
      updatedAt: 100
    });

    render(<SettingsSkillsSection />);

    await waitFor(() => {
      expect(screen.getByText('Temporary Skill')).toBeDefined();
    });

    const deleteBtn = screen.getByLabelText('Delete Temporary Skill');
    fireEvent.click(deleteBtn);

    await waitFor(async () => {
      expect(await db.skills.get('skill-to-delete')).toBeUndefined();
      expect(screen.queryByText('Temporary Skill')).toBeNull();
    });
  });
});
