import { useEffect, useState } from 'react';
import { Card, Table, Tag, Button, Input, InputNumber, Space, Modal, Form, Popconfirm, message } from 'antd';
import axios from 'axios';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  fetchAllSkillLevels,
  createSkillLevel,
  updateSkillLevel,
  deleteSkillLevel,
} from '../../services/skillLevelService';
import { SkillLevel } from '../../types/skillLevel';

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function SkillLevelPage() {
  const [levels, setLevels] = useState<SkillLevel[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLevel, setEditingLevel] = useState<SkillLevel | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadLevels = async () => {
    setLoading(true);
    try {
      setLevels(await fetchAllSkillLevels());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLevels();
  }, []);

  const openCreateModal = () => {
    setEditingLevel(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (level: SkillLevel) => {
    setEditingLevel(level);
    form.setFieldsValue({ name: level.name, weight: level.weight });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editingLevel) {
        await updateSkillLevel(editingLevel.id, values);
        message.success('Skill level updated');
      } else {
        await createSkillLevel(values);
        message.success('Skill level created');
      }
      setModalOpen(false);
      loadLevels();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save skill level'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (level: SkillLevel) => {
    try {
      await deleteSkillLevel(level.id);
      message.success('Skill level deleted');
      loadLevels();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete skill level'));
    }
  };

  return (
    <Card
      title="Skill Levels"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          Add Skill Level
        </Button>
      }
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={levels}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          {
            title: 'Weight Point',
            dataIndex: 'weight',
            render: (v: number) => <Tag color="geekblue">{v}</Tag>,
          },
          {
            title: 'Actions',
            render: (_, record: SkillLevel) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                  Edit
                </Button>
                <Popconfirm title="Delete this skill level?" onConfirm={() => handleDelete(record)}>
                  <Button size="small" danger icon={<DeleteOutlined />}>
                    Delete
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingLevel ? 'Edit skill level' : 'Add skill level'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. Junior, Middle, Senior, Expert, Master" />
          </Form.Item>
          <Form.Item
            name="weight"
            label="Weight point"
            rules={[{ required: true }]}
            tooltip="Weight applied when scoring an employee's skill held at this level."
          >
            <InputNumber min={0} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
