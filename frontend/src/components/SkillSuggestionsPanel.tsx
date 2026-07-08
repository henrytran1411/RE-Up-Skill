import { FireOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Card, message, Popconfirm, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { declareSkill } from '../services/skillService';
import { CompanyNeedLevel, SkillTrack } from '../types/common';
import { SkillGapSuggestion, SuggestedSkill } from '../types/skillSuggestion';

const PRIORITY_COLORS: Record<number, string> = { 1: 'default', 2: 'blue', 3: 'orange', 4: 'red' };

interface SkillSuggestionsPanelProps {
  suggestions: SkillGapSuggestion[];
  /** Called after a suggested skill is successfully added, so the parent can refresh its data. */
  onAdded?: () => void;
}

/** Categories the employee has no skill in yet, highest-priority category first. */
export function SkillSuggestionsPanel({ suggestions, onAdded }: Readonly<SkillSuggestionsPanelProps>) {
  const [addingSkillId, setAddingSkillId] = useState<string | null>(null);

  const handleStartLearning = async (skill: SuggestedSkill) => {
    setAddingSkillId(skill.id);
    try {
      await declareSkill({
        skillId: skill.id,
        track: SkillTrack.LEARNING,
        proficiency: 1,
        startDate: dayjs().format('YYYY-MM-DD'),
      });
      message.success(`Added "${skill.name}" to your learning list`);
      onAdded?.();
    } catch {
      message.error(`Failed to add "${skill.name}"`);
    } finally {
      setAddingSkillId(null);
    }
  };

  if (suggestions.length === 0) {
    return <div style={{ color: '#999' }}>No suggestions — you already have a skill in every category.</div>;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {suggestions.map((suggestion) => (
        <Card
          key={suggestion.categoryId}
          size="small"
          title={
            <Space>
              <Tag color={PRIORITY_COLORS[suggestion.priority] ?? 'default'}>Priority {suggestion.priority}</Tag>
              {suggestion.categoryName}
            </Space>
          }
        >
          {suggestion.description && (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {suggestion.description}
            </Typography.Paragraph>
          )}
          <Space wrap>
            {suggestion.suggestedSkills.map((skill) => {
              const isVeryNeeded = skill.companyNeedLevel === CompanyNeedLevel.VERY_NEEDED;
              return (
                <Popconfirm
                  key={skill.id}
                  title={`Start learning "${skill.name}"?`}
                  description="Adds a Learning-track skill entry starting today."
                  onConfirm={() => handleStartLearning(skill)}
                  okText="Start learning"
                >
                  <Tag
                    color={isVeryNeeded ? 'red' : 'default'}
                    style={{ cursor: 'pointer', fontWeight: isVeryNeeded ? 700 : undefined }}
                  >
                    {isVeryNeeded && <FireOutlined style={{ marginRight: 4 }} />}
                    {skill.name}
                    {isVeryNeeded ? ' · very needed' : ''}
                    {skill.isFoundational ? ' · foundational' : ''}
                    {skill.isKeySkill ? ' · key skill' : ''}
                    {' '}
                    <Button
                      type="text"
                      size="small"
                      icon={<PlusOutlined />}
                      loading={addingSkillId === skill.id}
                      style={{ height: 16, padding: 0, marginLeft: 4 }}
                    />
                  </Tag>
                </Popconfirm>
              );
            })}
          </Space>
        </Card>
      ))}
    </Space>
  );
}
